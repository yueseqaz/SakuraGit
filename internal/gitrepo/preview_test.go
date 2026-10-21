package gitrepo

import (
	"bytes"
	"context"
	"encoding/base64"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBinaryPreviewPagingAndNoWrites(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	content := strings.Repeat("\x00\xffABC", 2000)
	write(t, root, "bytes.bin", content)
	before := git(t, root, "status", "--porcelain")
	for _, offset := range []int64{0, 4096, 8192} {
		p, err := e.EditorPreview(ctx, root, "bytes.bin", offset)
		if err != nil {
			t.Fatal(err)
		}
		data, err := base64.StdEncoding.DecodeString(p.Data)
		end := min(int(offset)+4096, len(content))
		if err != nil || string(data) != content[offset:end] || p.More != (end < len(content)) || p.Size != int64(len(content)) || p.Image {
			t.Fatal("incorrect binary page", p, err)
		}
	}
	if git(t, root, "status", "--porcelain") != before {
		t.Fatal("preview changed index/worktree")
	}
	data, _ := os.ReadFile(filepath.Join(root, "bytes.bin"))
	if string(data) != content {
		t.Fatal("preview modified file")
	}
	for _, offset := range []int64{-1, 1, 12288} {
		if _, err := e.EditorPreview(ctx, root, "bytes.bin", offset); err == nil {
			t.Fatal("accepted invalid offset", offset)
		}
	}
	if _, err := e.SaveEditorFile(ctx, root, "bytes.bin", "fake", "text"); err == nil {
		t.Fatal("binary became writable")
	}
}
func TestImagePreviewAndConfinedPaths(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	var data bytes.Buffer
	if err := png.Encode(&data, image.NewRGBA(image.Rect(0, 0, 2, 2))); err != nil {
		t.Fatal(err)
	}
	write(t, root, "picture.png", data.String())
	p, err := e.EditorPreview(ctx, root, "picture.png", 0)
	if err != nil || !p.Image || p.Mime != "image/png" || p.More {
		t.Fatal(p, err)
	}
	decoded, _ := base64.StdEncoding.DecodeString(p.Data)
	if !bytes.Equal(decoded, data.Bytes()) {
		t.Fatal("image bytes altered")
	}
	write(t, root, "active.svg", "<svg onload='alert(1)'/>")
	p, err = e.EditorPreview(ctx, root, "active.svg", 0)
	if err != nil || p.Image {
		t.Fatal("active image allowed", p, err)
	}
	for _, path := range []string{".git/config", "../outside", "/etc/passwd", "a\\b"} {
		if _, err := e.EditorPreview(ctx, root, path, 0); err == nil {
			t.Fatal("unsafe path", path)
		}
	}
	if err := os.Symlink("picture.png", filepath.Join(root, "linked.png")); err == nil {
		if _, err = e.EditorPreview(ctx, root, "linked.png", 0); err == nil {
			t.Fatal("followed symlink")
		}
	}
	write(t, root, "big.bin", strings.Repeat("\x00", 5<<20))
	p, err = e.EditorPreview(ctx, root, "big.bin", 0)
	if err != nil || len(p.Data) > 6000 || !p.More {
		t.Fatal("unbounded big preview", err)
	}
	if _, err = e.EditorPreview(ctx, t.TempDir(), "picture.png", 0); err == nil {
		t.Fatal("unopened root")
	}
}
