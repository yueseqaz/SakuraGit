package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/egoist/mygo"
	"github.com/yueseqaz/SakuraGit/internal/devtools"
)

type QuickCommand struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Command   string `json:"command"`
	Directory string `json:"directory"`
}
type DeveloperConfig struct {
	Variables []devtools.Variable `json:"variables"`
	Commands  []QuickCommand      `json:"commands"`
}

var variableName = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
var commandID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

func validateDeveloperConfig(c DeveloperConfig) error {
	if len(c.Variables) > 64 || len(c.Commands) > 30 {
		return errors.New("最多 64 个环境变量和 30 个快捷命令")
	}
	seen := map[string]bool{}
	for _, v := range c.Variables {
		key := strings.ToUpper(v.Name)
		if !variableName.MatchString(v.Name) || seen[key] || len(v.Value) > 64<<10 || strings.ContainsAny(v.Value, "\x00\r\n") {
			return errors.New("环境变量名称无效、重复或值过长；请每行填写 KEY=value")
		}
		seen[key] = true
	}
	seen = map[string]bool{}
	for _, c := range c.Commands {
		if !commandID.MatchString(c.ID) || seen[c.ID] || strings.TrimSpace(c.Name) == "" || len(c.Name) > 100 || strings.TrimSpace(c.Command) == "" || len(c.Command) > 16<<10 || strings.ContainsAny(c.Command, "\x00\r") || strings.ContainsAny(c.Name, "\x00\r\n") {
			return errors.New("快捷命令名称、内容或标识无效")
		}
		if !validCommandDirectory(c.Directory) {
			return errors.New("工作目录必须是仓库内的相对目录，不能包含 .. 或 .git")
		}
		seen[c.ID] = true
	}
	return nil
}
func validCommandDirectory(path string) bool {
	if path == "" || path == "." {
		return true
	}
	if len(path) > 4096 || filepath.IsAbs(path) || strings.ContainsAny(path, "\\:\x00\r\n") {
		return false
	}
	for _, part := range strings.Split(path, "/") {
		if part == "" || part == "." || part == ".." || strings.EqualFold(part, ".git") || strings.TrimRight(part, " .") != part {
			return false
		}
	}
	return true
}
func developerDirectory(root, path string) (string, error) {
	if !validCommandDirectory(path) {
		return "", errors.New("无效的命令工作目录")
	}
	if path == "" || path == "." {
		return root, nil
	}
	current := root
	for _, part := range strings.Split(path, "/") {
		current = filepath.Join(current, part)
		info, err := os.Lstat(current)
		if err != nil {
			return "", err
		}
		if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return "", errors.New("工作目录不能是符号链接或非目录")
		}
		if _, err := os.Lstat(filepath.Join(current, ".git")); err == nil {
			return "", errors.New("嵌套仓库请单独打开后配置快捷命令")
		}
	}
	return current, nil
}
func (g *Git) developerPath(root string) (string, error) {
	if g.ephemeral {
		return "", errors.New("隔离测试模式不读取或保存开发命令")
	}
	dir, err := mygo.App.Path(mygo.PathUserData)
	sum := sha256.Sum256([]byte(root))
	return filepath.Join(dir, "developer", hex.EncodeToString(sum[:])+".json"), err
}
func readDeveloperConfig(path string) (DeveloperConfig, error) {
	c := DeveloperConfig{Variables: []devtools.Variable{}, Commands: []QuickCommand{}}
	f, err := os.Open(path)
	if os.IsNotExist(err) {
		return c, nil
	}
	if err != nil {
		return c, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, (1<<20)+1))
	if err != nil {
		return c, err
	}
	if len(data) > 1<<20 {
		return c, errors.New("开发配置文件过大")
	}
	if err = json.Unmarshal(data, &c); err != nil {
		return c, errors.New("开发配置损坏；未覆盖原文件")
	}
	if c.Variables == nil {
		c.Variables = []devtools.Variable{}
	}
	if c.Commands == nil {
		c.Commands = []QuickCommand{}
	}
	return c, validateDeveloperConfig(c)
}
func writeDeveloperConfig(path string, c DeveloperConfig) error {
	if err := validateDeveloperConfig(c); err != nil {
		return err
	}
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	if len(data) > 1<<20 {
		return errors.New("开发配置总大小不能超过 1 MB")
	}
	if err = os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".developer-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if _, err = f.Write(data); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	return os.Rename(f.Name(), path)
}
func (g *Git) DeveloperConfig(ctx context.Context, root string) (DeveloperConfig, error) {
	if _, err := g.engine.DevelopmentPath(ctx, root, ""); err != nil {
		return DeveloperConfig{}, err
	}
	path, err := g.developerPath(root)
	if err != nil {
		return DeveloperConfig{}, err
	}
	g.developerMu.Lock()
	defer g.developerMu.Unlock()
	return readDeveloperConfig(path)
}
func (g *Git) SaveDeveloperConfig(ctx context.Context, root string, c DeveloperConfig) error {
	if _, err := g.engine.DevelopmentPath(ctx, root, ""); err != nil {
		return err
	}
	path, err := g.developerPath(root)
	if err != nil {
		return err
	}
	g.developerMu.Lock()
	defer g.developerMu.Unlock()
	return writeDeveloperConfig(path, c)
}
func (g *Git) shellEnvironment(ctx context.Context, refresh bool) devtools.Environment {
	g.environmentMu.Lock()
	defer g.environmentMu.Unlock()
	if g.environment == nil || refresh {
		e := devtools.Detect(ctx)
		g.environment = &e
	}
	return *g.environment
}
func (g *Git) DevelopmentEnvironment(ctx context.Context, root string, refresh bool) (devtools.Environment, error) {
	c, err := g.DeveloperConfig(ctx, root)
	if err != nil {
		return devtools.Environment{}, err
	}
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	return devtools.Probe(ctx, g.shellEnvironment(ctx, refresh), c.Variables), nil
}
func (g *Git) RunDeveloperCommand(ctx context.Context, root string, expected QuickCommand) error {
	c, err := g.DeveloperConfig(ctx, root)
	if err != nil {
		return err
	}
	for _, command := range c.Commands {
		if command.ID != expected.ID {
			continue
		}
		if command != expected {
			return errors.New("命令配置已变化，请重新读取并确认")
		}
		dir, err := developerDirectory(root, command.Directory)
		if err != nil {
			return err
		}
		e := g.shellEnvironment(ctx, false)
		if e.Shell == "" {
			return errors.New("未找到系统 Shell")
		}
		return g.createRepositoryTerminalWithLaunch(ctx, root, true, &terminalLaunch{
			label: command.Name, dir: dir, command: devtools.Command(e.Shell, command.Command),
			env: devtools.Env(devtools.EffectiveVariables(e.Variables, c.Variables)),
		})
	}
	return errors.New("快捷命令已删除，请刷新列表")
}
