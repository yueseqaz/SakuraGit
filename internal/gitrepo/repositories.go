package gitrepo

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var remoteNamePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$`)
var scpURLPattern = regexp.MustCompile(`^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+:.+$`)

func validateRemoteURL(value string) error {
	if value == "" || len(value) > 4096 || strings.ContainsAny(value, "\r\n\x00") || strings.HasPrefix(value, "-") || strings.Contains(value, "::") {
		return errors.New("无效的仓库地址；不支持外部协议助手")
	}
	if filepath.IsAbs(value) {
		return nil
	}
	if scpURLPattern.MatchString(value) && !strings.ContainsAny(value, " \t") {
		return nil
	}
	u, err := url.Parse(value)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http" && u.Scheme != "ssh") || u.Host == "" || strings.ContainsAny(value, " \t") {
		return errors.New("请输入 HTTPS、SSH 地址，或本机绝对路径")
	}
	if u.User != nil {
		if u.Scheme == "https" || u.Scheme == "http" {
			return errors.New("HTTPS 地址中不要嵌入账号或 Token，请使用系统凭据助手")
		}
		if _, has := u.User.Password(); has {
			return errors.New("请使用系统凭据助手，不要把密码或 Token 放在仓库地址中")
		}
	}
	return nil
}

// New repositories must have a new destination; no existing directory is overwritten.
func (e *Engine) CreateRepository(ctx context.Context, source, destination string, initialize bool) (string, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if !filepath.IsAbs(destination) {
		return "", errors.New("目标文件夹必须使用绝对路径")
	}
	destination = filepath.Clean(destination)
	if !initialize {
		if err := validateRemoteURL(source); err != nil {
			return "", err
		}
	}
	parent, err := filepath.EvalSymlinks(filepath.Dir(destination))
	if err != nil {
		return "", errors.New("请先选择已存在的父文件夹")
	}
	destination = filepath.Join(parent, filepath.Base(destination))
	if err := os.Mkdir(destination, 0755); err != nil {
		return "", fmt.Errorf("目标必须是尚不存在的新文件夹，不会覆盖原有内容: %w", err)
	}
	args := []string{"init", "--initial-branch=main", "--", destination}
	if !initialize {
		args = []string{"-c", "protocol.ext.allow=never", "clone", "--no-recurse-submodules", "--", source, destination}
	}
	if _, err := run(ctx, "", args...); err != nil {
		return "", fmt.Errorf("操作未完整完成，目标目录已保留供检查（%s），不会自动删除其中内容: %w", destination, err)
	}
	return destination, nil
}

func (e *Engine) InitializeExisting(ctx context.Context, path string) (string, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if !filepath.IsAbs(path) {
		return "", errors.New("项目目录必须使用绝对路径")
	}
	path, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(path)
	if err != nil || !info.IsDir() {
		return "", errors.New("请选择已有的项目文件夹")
	}
	if _, err := os.Lstat(filepath.Join(path, ".git")); !os.IsNotExist(err) {
		return "", errors.New("此目录已包含 Git 元数据，不会重新初始化或覆盖")
	}
	if _, err := run(ctx, path, "rev-parse", "--git-dir"); err == nil {
		return "", errors.New("此目录已经是 Git 仓库，或位于已有仓库内，请直接打开对应仓库")
	}
	if _, err := run(ctx, "", "init", "--initial-branch=main", "--", path); err != nil {
		return "", err
	}
	return path, nil
}

func (e *Engine) remoteInfo(ctx context.Context) ([]RemoteInfo, error) {
	names, err := run(ctx, e.root, "remote")
	if err != nil {
		return nil, err
	}
	result := []RemoteInfo{}
	for _, name := range strings.Fields(names) {
		fetch, err := run(ctx, e.root, "remote", "get-url", "--all", name)
		if err != nil {
			return nil, err
		}
		push, err := run(ctx, e.root, "remote", "get-url", "--push", "--all", name)
		if err != nil {
			return nil, err
		}
		result = append(result, RemoteInfo{Name: name, FetchURLs: strings.Split(strings.TrimSuffix(fetch, "\n"), "\n"), PushURLs: strings.Split(strings.TrimSuffix(push, "\n"), "\n"), Revision: digest(fetch + "\x00" + push)})
	}
	return result, nil
}

func (e *Engine) Remotes(ctx context.Context, root string) ([]RemoteInfo, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return nil, err
	}
	return e.remoteInfo(ctx)
}

func (e *Engine) ManageRemote(ctx context.Context, root, action, name, address, revision string) (Result, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return Result{}, err
	}
	if !remoteNamePattern.MatchString(name) {
		return Result{}, errors.New("远程名称只允许英文字母、数字、点、下划线和连字符，并以字母或数字开头")
	}
	items, err := e.remoteInfo(ctx)
	if err != nil {
		return Result{}, err
	}
	var current *RemoteInfo
	for i := range items {
		if items[i].Name == name {
			current = &items[i]
		}
	}
	var args []string
	switch action {
	case "add":
		if current != nil {
			return Result{}, errors.New("同名远程仓库已存在")
		}
		if err := validateRemoteURL(address); err != nil {
			return Result{}, err
		}
		args = []string{"remote", "add", name, address}
	case "fetch-url", "push-url", "remove":
		if current == nil || revision == "" || current.Revision != revision {
			return Result{}, errors.New("远程配置已变化，请刷新后重新确认")
		}
		if action == "remove" {
			args = []string{"remote", "remove", name}
		} else {
			if err := validateRemoteURL(address); err != nil {
				return Result{}, err
			}
			if action == "fetch-url" && len(current.FetchURLs) != 1 || action == "push-url" && len(current.PushURLs) != 1 {
				return Result{}, errors.New("此远程配置有多个地址，请在终端管理以避免误覆盖")
			}
			args = []string{"remote", "set-url"}
			if action == "push-url" {
				args = append(args, "--push")
			}
			args = append(args, name, address)
		}
	default:
		return Result{}, errors.New("不支持的远程操作")
	}
	out, err := run(ctx, e.root, args...)
	e.record("远程配置 "+action+" "+name, out, err)
	return Result{Output: out}, err
}

func (e *Engine) Diagnostics(ctx context.Context, root string) (Diagnostics, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return Diagnostics{}, err
	}
	version, err := run(ctx, e.root, "--version")
	if err != nil {
		return Diagnostics{}, err
	}
	name, _ := run(ctx, e.root, "config", "--get", "user.name")
	email, _ := run(ctx, e.root, "config", "--get", "user.email")
	helper, _ := run(ctx, e.root, "config", "--get-all", "credential.helper")
	ssh, _ := run(ctx, e.root, "config", "--get", "core.sshCommand")
	return Diagnostics{Version: strings.TrimSpace(version), Name: strings.TrimSpace(name), Email: strings.TrimSpace(email), CredentialHelper: strings.TrimSpace(helper) != "", CustomSSH: strings.TrimSpace(ssh) != ""}, nil
}

func (e *Engine) SetIdentity(ctx context.Context, root, name, email string) (Result, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return Result{}, err
	}
	if strings.TrimSpace(name) == "" || !strings.Contains(email, "@") || len(name) > 200 || len(email) > 300 || strings.ContainsAny(name+email, "\r\n\x00<>") {
		return Result{}, errors.New("请填写有效的姓名和邮箱")
	}
	if _, err := run(ctx, e.root, "config", "--local", "--", "user.name", name); err != nil {
		return Result{}, err
	}
	out, err := run(ctx, e.root, "config", "--local", "--", "user.email", email)
	e.record("设置本仓库提交身份", out, err)
	return Result{Output: out}, err
}

// Lightweight polling catches content edits even when porcelain status remains 'M'.
func (e *Engine) ChangeToken(ctx context.Context, root string) (string, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return "", err
	}
	raw, err := run(ctx, e.root, "status", "--porcelain=v2", "-z", "--branch", "--untracked-files=all")
	if err != nil {
		return "", err
	}
	s, err := parseStatus(raw)
	if err != nil {
		return "", err
	}
	var text strings.Builder
	text.WriteString(raw)
	rootFS, err := os.OpenRoot(e.root)
	if err != nil {
		return "", err
	}
	defer rootFS.Close()
	for _, f := range s.Files {
		info, err := rootFS.Lstat(f.Path)
		if err == nil {
			fmt.Fprintf(&text, "\x00%s:%d:%d:%s", f.Path, info.Size(), info.ModTime().UnixNano(), info.Mode())
		}
	}
	refs, err := run(ctx, e.root, "for-each-ref", "--format=%(refname) %(objectname)")
	if err != nil {
		return "", err
	}
	text.WriteString(refs)
	// Reflog entries and remote config changes may leave the current branch unchanged.
	stash, err := e.stashes(ctx)
	if err != nil {
		return "", err
	}
	fmt.Fprint(&text, stash)
	config, err := run(ctx, e.root, "config", "--local", "--null", "--list")
	if err != nil {
		return "", err
	}
	text.WriteString(config)
	gitDir, err := run(ctx, e.root, "rev-parse", "--absolute-git-dir")
	if err != nil {
		return "", err
	}
	for _, marker := range []string{"MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply", "BISECT_LOG"} {
		if info, err := os.Lstat(filepath.Join(strings.TrimSuffix(gitDir, "\n"), marker)); err == nil {
			fmt.Fprintf(&text, "%s:%d:%d", marker, info.Size(), info.ModTime().UnixNano())
		}
	}
	return digest(text.String()), nil
}
