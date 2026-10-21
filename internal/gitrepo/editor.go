package gitrepo

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type EditorEntry struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	Directory bool   `json:"directory"`
}
type EditorDirectory struct {
	Entries   []EditorEntry `json:"entries"`
	Truncated bool          `json:"truncated"`
}
type EditorFile struct {
	Path     string `json:"path"`
	Content  string `json:"content"`
	Revision string `json:"revision"`
}

// Reject every symlink component, metadata and nested repositories. OpenRoot
// also confines subsequent I/O if a directory is replaced concurrently.
func editorPath(fs *os.Root, path string, directory bool) (os.FileInfo, error) {
	if path == "" && directory {
		return fs.Stat(".")
	}
	if path == "" || filepath.IsAbs(path) || strings.ContainsAny(path, "\\\x00:") || filepath.ToSlash(filepath.Clean(path)) != path {
		return nil, errors.New("请选择仓库内的相对文件路径")
	}
	parts := strings.Split(path, "/")
	var info os.FileInfo
	for i, part := range parts {
		if part == "." || part == ".." || strings.EqualFold(strings.TrimRight(part, " ."), ".git") || strings.TrimRight(part, " .") != part {
			return nil, errors.New("编辑器不能访问 Git 元数据或仓库外路径")
		}
		prefix := strings.Join(parts[:i+1], "/")
		var err error
		info, err = fs.Lstat(prefix)
		if err != nil {
			return nil, err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return nil, errors.New("编辑器不跟随符号链接")
		}
		if info.IsDir() {
			if _, err := fs.Lstat(filepath.Join(prefix, ".git")); err == nil {
				return nil, errors.New("嵌套仓库请单独打开")
			}
		} else if i != len(parts)-1 {
			return nil, errors.New("路径中存在非目录文件")
		}
	}
	if directory && !info.IsDir() || !directory && !info.Mode().IsRegular() {
		return nil, errors.New("请选择普通工作文件或目录")
	}
	return info, nil
}

func (e *Engine) EditorDirectory(ctx context.Context, root, path string) (EditorDirectory, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	d := EditorDirectory{Entries: []EditorEntry{}}
	if err := e.checkRoot(root); err != nil {
		return d, err
	}
	if err := ctx.Err(); err != nil {
		return d, err
	}
	fs, err := os.OpenRoot(e.root)
	if err != nil {
		return d, err
	}
	defer fs.Close()
	if _, err = editorPath(fs, path, true); err != nil {
		return d, err
	}
	name := path
	if name == "" {
		name = "."
	}
	dir, err := fs.Open(name)
	if err != nil {
		return d, err
	}
	defer dir.Close()
	entries, err := dir.ReadDir(2001)
	if err != nil && !errors.Is(err, io.EOF) {
		return d, err
	}
	d.Truncated = len(entries) > 2000
	if d.Truncated {
		entries = entries[:2000]
	}
	for _, entry := range entries {
		if strings.EqualFold(entry.Name(), ".git") || entry.Type()&os.ModeSymlink != 0 || !entry.IsDir() && !entry.Type().IsRegular() {
			continue
		}
		p := filepath.ToSlash(filepath.Join(path, entry.Name()))
		d.Entries = append(d.Entries, EditorEntry{Name: entry.Name(), Path: p, Directory: entry.IsDir()})
	}
	sort.Slice(d.Entries, func(i, j int) bool {
		if d.Entries[i].Directory != d.Entries[j].Directory {
			return d.Entries[i].Directory
		}
		return d.Entries[i].Name < d.Entries[j].Name
	})
	return d, nil
}

func readEditorFile(fs *os.Root, path string) (EditorFile, os.FileMode, error) {
	d := EditorFile{Path: path}
	info, err := editorPath(fs, path, false)
	if err != nil {
		return d, 0, err
	}
	if info.Size() > 1<<20 {
		return d, 0, errors.New("内置编辑器仅支持 1 MB 以内的 UTF-8 文本")
	}
	f, err := fs.Open(path)
	if err != nil {
		return d, 0, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, (1<<20)+1))
	if err != nil {
		return d, 0, err
	}
	if !safeMergeText(string(data)) {
		return d, 0, errors.New("二进制、非 UTF-8 或超大文件请使用外部编辑器")
	}
	text := string(data)
	if strings.ContainsRune(strings.ReplaceAll(text, "\r\n", ""), '\r') || strings.Contains(text, "\r\n") && strings.Count(text, "\n") != strings.Count(text, "\r\n") {
		return d, 0, errors.New("混合或旧式换行文件请使用外部编辑器，以免转换换行")
	}
	d.Content, d.Revision = string(data), digest(string(data)+"\x00"+info.Mode().String())
	return d, info.Mode().Perm(), nil
}

func (e *Engine) EditorFile(ctx context.Context, root, path string) (EditorFile, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return EditorFile{}, err
	}
	if err := ctx.Err(); err != nil {
		return EditorFile{}, err
	}
	fs, err := os.OpenRoot(e.root)
	if err != nil {
		return EditorFile{}, err
	}
	defer fs.Close()
	d, _, err := readEditorFile(fs, path)
	return d, err
}

func (e *Engine) SaveEditorFile(ctx context.Context, root, path, revision, content string) (EditorFile, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return EditorFile{}, err
	}
	if !safeMergeText(content) {
		return EditorFile{}, errors.New("仅支持 1 MB 以内的 UTF-8 文本")
	}
	if err := ctx.Err(); err != nil {
		return EditorFile{}, err
	}
	fs, err := os.OpenRoot(e.root)
	if err != nil {
		return EditorFile{}, err
	}
	defer fs.Close()
	d, mode, err := readEditorFile(fs, path)
	if err != nil {
		return d, err
	}
	if revision == "" || revision != d.Revision {
		return d, errors.New("文件已被外部修改，请保留草稿并重新读取；不会覆盖磁盘内容")
	}
	if content == d.Content {
		return d, nil
	}
	if err = e.backupWorkFile(ctx, path, []byte(d.Content)); err != nil {
		return d, err
	}
	if err = replaceWorkFile(fs, path, []byte(d.Content), []byte(content), mode); err != nil {
		return d, err
	}
	return EditorFile{Path: path, Content: content, Revision: digest(content + "\x00" + mode.String())}, nil
}
