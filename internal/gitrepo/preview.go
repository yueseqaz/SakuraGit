package gitrepo

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"os"
)

const previewPageSize = 4096

type BinaryPreview struct {
	Path   string `json:"path"`
	Size   int64  `json:"size"`
	Offset int64  `json:"offset"`
	Data   string `json:"data"`
	Mime   string `json:"mime"`
	Image  bool   `json:"image"`
	More   bool   `json:"more"`
}

func (e *Engine) EditorPreview(ctx context.Context, root, path string, offset int64) (BinaryPreview, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	p := BinaryPreview{Path: path, Offset: offset}
	if err := e.checkRoot(root); err != nil {
		return p, err
	}
	if err := ctx.Err(); err != nil {
		return p, err
	}
	if offset < 0 || offset%previewPageSize != 0 {
		return p, errors.New("无效的预览页码")
	}
	fs, err := os.OpenRoot(e.root)
	if err != nil {
		return p, err
	}
	defer fs.Close()
	if _, err = editorPath(fs, path, false); err != nil {
		return p, err
	}
	f, err := fs.Open(path)
	if err != nil {
		return p, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return p, err
	}
	if !info.Mode().IsRegular() || offset > info.Size() {
		return p, errors.New("文件不可预览或已变化，请重新打开")
	}
	p.Size = info.Size()
	data := make([]byte, previewPageSize)
	n, err := f.ReadAt(data, offset)
	if err != nil && !errors.Is(err, io.EOF) {
		return p, err
	}
	data = data[:n]
	p.More = offset+int64(n) < p.Size
	// Decode only raster headers; SVG/HTML never become active WebView content.
	if offset == 0 && p.Size <= 4<<20 {
		config, format, imageErr := image.DecodeConfig(bytes.NewReader(data))
		if imageErr == nil && config.Width > 0 && config.Height > 0 && int64(config.Width)*int64(config.Height) <= 16_000_000 {
			all, readErr := io.ReadAll(io.LimitReader(f, (4<<20)+1))
			if readErr != nil {
				return p, readErr
			}
			if len(all) <= 4<<20 {
				p.Image, p.Mime, p.More = true, "image/"+format, false
				data = all
			}
		}
	}
	p.Data = base64.StdEncoding.EncodeToString(data)
	return p, nil
}
