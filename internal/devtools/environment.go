package devtools

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

type Variable struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}
type Tool struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	Version string `json:"version"`
}
type Environment struct {
	Shell     string     `json:"shell"`
	Source    string     `json:"source"`
	Warning   string     `json:"warning"`
	Variables []Variable `json:"variables"`
	Tools     []Tool     `json:"tools"`
}

var readableVariables = []string{"PATH", "JAVA_HOME", "JDK_HOME", "GOROOT", "GOPATH", "GOBIN", "NVM_DIR", "VOLTA_HOME", "FNM_DIR", "PNPM_HOME", "PHP_INI_SCAN_DIR", "COMPOSER_HOME"}

// Bounded subprocess output prevents verbose startup scripts/tools exhausting memory.
type limitedOutput struct {
	mu    sync.Mutex
	b     bytes.Buffer
	limit int
}

func (w *limitedOutput) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	n := len(p)
	if w.b.Len() < w.limit {
		w.b.Write(p[:min(len(p), w.limit-w.b.Len())])
	}
	return n, nil
}
func output(ctx context.Context, dir string, env []string, command []string, limit int) ([]byte, error) {
	cmd := exec.CommandContext(ctx, command[0], command[1:]...)
	cmd.Dir, cmd.Env = dir, env
	cmd.WaitDelay = 250 * time.Millisecond
	w := &limitedOutput{limit: limit}
	cmd.Stdout, cmd.Stderr = w, w
	err := cmd.Run()
	return append([]byte(nil), w.b.Bytes()...), err
}
func Shell() (string, error) {
	if runtime.GOOS == "windows" {
		for _, name := range []string{"pwsh.exe", "powershell.exe"} {
			if path, err := exec.LookPath(name); err == nil && filepath.IsAbs(path) {
				return path, nil
			}
		}
		return "", errors.New("未找到 PowerShell，请先安装或加入 PATH")
	}
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/sh"
		if runtime.GOOS == "darwin" {
			shell = "/bin/zsh"
		}
	}
	if !filepath.IsAbs(shell) {
		return "", errors.New("Shell 路径必须是绝对路径")
	}
	return shell, nil
}
func ParseEnvironment(data []byte) map[string]string {
	values := map[string]string{}
	for _, pair := range bytes.Split(data, []byte{0}) {
		key, value, ok := strings.Cut(string(pair), "=")
		if ok && len(value) <= 64<<10 {
			values[strings.ToUpper(key)] = value
		}
	}
	return values
}
func selectedVariables(values map[string]string) []Variable {
	result := []Variable{}
	for _, key := range readableVariables {
		if value := values[key]; value != "" {
			result = append(result, Variable{key, value})
		}
	}
	return result
}
func Detect(ctx context.Context) Environment {
	e := Environment{Source: "进程环境", Variables: []Variable{}, Tools: []Tool{}}
	values := ParseEnvironment([]byte(strings.Join(os.Environ(), "\x00")))
	shell, err := Shell()
	e.Shell = shell
	if err == nil {
		home, _ := os.UserHomeDir()
		probeCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
		var data []byte
		if runtime.GOOS == "windows" {
			script := `[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $m=[Environment]::GetEnvironmentVariables('Machine'); $u=[Environment]::GetEnvironmentVariables('User'); $p=[string]$m['Path']; foreach($k in $u.Keys){if($k -ieq 'Path'){$m['Path']=$p+';'+$u[$k]}else{$m[$k]=$u[$k]}}; $o=@{}; foreach($k in $m.Keys){$o[[string]$k]=[Environment]::ExpandEnvironmentVariables([string]$m[$k])}; $o|ConvertTo-Json -Compress`
			data, err = output(probeCtx, home, os.Environ(), []string{shell, "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script}, 256<<10)
			var result map[string]string
			if err == nil {
				err = json.Unmarshal(bytes.TrimPrefix(data, []byte{0xef, 0xbb, 0xbf}), &result)
			}
			if err == nil {
				for k, v := range result {
					values[strings.ToUpper(k)] = v
				}
				e.Source = "Windows 用户 / 系统环境"
			}
		} else {
			marker := rand.Text()
			data, err = output(probeCtx, home, os.Environ(), []string{shell, "-l", "-i", "-c", "printf '\\0" + marker + "\\0'; /usr/bin/env -0"}, 256<<10)
			start := bytes.Index(data, []byte("\x00"+marker+"\x00"))
			if err == nil && start >= 0 {
				values = ParseEnvironment(data[start+len(marker)+2:])
				e.Source = "登录 Shell（用户主目录）"
			} else if err == nil {
				err = io.ErrUnexpectedEOF
			}
		}
		cancel()
	}
	if err != nil {
		e.Warning = "读取登录环境失败，使用应用启动时的环境；可刷新或手动补充 PATH / JAVA_HOME。"
	}
	e.Variables = selectedVariables(values)
	return e
}

func Merge(base, overrides []Variable) []Variable {
	result := append([]Variable(nil), base...)
	for _, v := range overrides {
		found := false
		for i, old := range result {
			if strings.EqualFold(old.Name, v.Name) {
				result[i] = v
				found = true
				break
			}
		}
		if !found {
			result = append(result, v)
		}
	}
	return result
}
func Env(variables []Variable) []string {
	result := append([]string(nil), os.Environ()...)
	for _, v := range variables {
		found := false
		for i, old := range result {
			key, _, _ := strings.Cut(old, "=")
			if strings.EqualFold(key, v.Name) {
				result[i] = v.Name + "=" + v.Value
				found = true
				break
			}
		}
		if !found {
			result = append(result, v.Name+"="+v.Value)
		}
	}
	return result
}
func Find(name string, variables []Variable) string {
	path := ""
	for _, v := range variables {
		if strings.EqualFold(v.Name, "PATH") {
			path = v.Value
		}
	}
	names := []string{name}
	if runtime.GOOS == "windows" {
		names = []string{name + ".exe", name + ".cmd", name + ".bat"}
	}
	for _, dir := range filepath.SplitList(path) {
		// Ignore empty/relative entries so the process CWD cannot select a tool.
		if !filepath.IsAbs(dir) {
			continue
		}
		for _, file := range names {
			p := filepath.Join(dir, file)
			if info, err := os.Stat(p); err == nil && info.Mode().IsRegular() && (runtime.GOOS == "windows" || info.Mode()&0111 != 0) {
				return p
			}
		}
	}
	return ""
}
func EffectiveVariables(base, overrides []Variable) []Variable {
	variables := Merge(base, overrides)
	pathIndex := -1
	for i, v := range variables {
		if strings.EqualFold(v.Name, "PATH") {
			pathIndex = i
		}
	}
	if pathIndex < 0 {
		variables = append(variables, Variable{Name: "PATH"})
		pathIndex = len(variables) - 1
	}
	// JAVA_HOME/GOROOT remain useful when an app was launched without a complete PATH.
	for _, v := range variables {
		if (v.Name == "JAVA_HOME" || v.Name == "GOROOT") && filepath.IsAbs(v.Value) {
			if variables[pathIndex].Value != "" {
				variables[pathIndex].Value += string(os.PathListSeparator)
			}
			variables[pathIndex].Value += filepath.Join(v.Value, "bin")
		}
	}
	return variables
}
func Probe(ctx context.Context, e Environment, overrides []Variable) Environment {
	e.Variables = EffectiveVariables(e.Variables, overrides)
	e.Tools = []Tool{}
	home, _ := os.UserHomeDir()
	for _, name := range []string{"java", "javac", "go", "php", "node", "npm", "pnpm", "yarn", "composer"} {
		t := Tool{Name: name, Path: Find(name, e.Variables)}
		if t.Path != "" && ctx.Err() == nil {
			args := []string{t.Path, "--version"}
			if name == "go" {
				args[1] = "version"
			}
			if name == "java" || name == "javac" {
				args[1] = "-version"
			}
			if runtime.GOOS == "windows" && !strings.EqualFold(filepath.Ext(t.Path), ".exe") {
				args = []string{e.Shell, "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "& '" + strings.ReplaceAll(t.Path, "'", "''") + "' --version"}
			}
			probeCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
			data, err := output(probeCtx, home, Env(e.Variables), args, 4096)
			cancel()
			if err != nil {
				t.Version = "版本检测失败或超时"
			} else {
				t.Version = strings.SplitN(strings.TrimSpace(string(data)), "\n", 2)[0]
			}
		}
		e.Tools = append(e.Tools, t)
	}
	return e
}

func Command(shell, script string) []string {
	if runtime.GOOS == "windows" {
		return []string{shell, "-NoLogo", "-NoProfile", "-Command", script}
	}
	return []string{shell, "-c", script}
}
