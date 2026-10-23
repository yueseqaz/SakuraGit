package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/egoist/mygo"
)

// ProjectProfile is deliberately based on repository files only. It gives a
// useful quick-start plan without sending source code to an AI provider.
type ProjectProfile struct {
	Kind            string        `json:"kind"`
	Label           string        `json:"label"`
	PackageManager  string        `json:"packageManager"`
	InstallCommand  string        `json:"installCommand"`
	Commands        []QuickCommand `json:"commands"`
	Signals         []string      `json:"signals"`
}

type AIProvider struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	BaseURL string `json:"baseUrl"`
	Model   string `json:"model"`
	APIKey  string `json:"apiKey"`
	Enabled bool   `json:"enabled"`
}

type ProjectAnalysis struct {
	Profile  ProjectProfile `json:"profile"`
	Provider string         `json:"provider"`
	Summary  string         `json:"summary"`
	Commands []QuickCommand `json:"commands"`
	Notes    []string       `json:"notes"`
}

var aiProviderID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

func hasProjectFile(root, name string) bool {
	info, err := os.Stat(filepath.Join(root, name))
	return err == nil && info.Mode().IsRegular()
}

func readProjectJSON(root, name string) map[string]any {
	data, err := os.ReadFile(filepath.Join(root, name))
	if err != nil || len(data) > 1<<20 {
		return nil
	}
	var value map[string]any
	if json.Unmarshal(data, &value) != nil {
		return nil
	}
	return value
}

func profileCommand(name, command string) QuickCommand {
	return QuickCommand{ID: "detect-" + strings.ToLower(strings.ReplaceAll(name, " ", "-")), Name: name, Command: command, Directory: ""}
}

func projectProfile(root string) ProjectProfile {
	profile := ProjectProfile{Kind: "unknown", Label: "未识别项目", Commands: []QuickCommand{}, Signals: []string{}}
	add := func(name, command string) { profile.Commands = append(profile.Commands, profileCommand(name, command)) }
	if hasProjectFile(root, "package.json") {
		profile.Kind, profile.Label = "node", "Node.js 前端项目"
		profile.Signals = append(profile.Signals, "package.json")
		profile.PackageManager, profile.InstallCommand = "npm", "npm install"
		if hasProjectFile(root, "package-lock.json") {
			profile.PackageManager, profile.InstallCommand = "npm", "npm ci"
		} else if hasProjectFile(root, "pnpm-lock.yaml") {
			profile.PackageManager, profile.InstallCommand = "pnpm", "pnpm install"
		} else if hasProjectFile(root, "yarn.lock") {
			profile.PackageManager, profile.InstallCommand = "yarn", "yarn install"
		}
		add("安装依赖", profile.InstallCommand)
		if pkg := readProjectJSON(root, "package.json"); pkg != nil {
			if scripts, ok := pkg["scripts"].(map[string]any); ok {
				for _, name := range []string{"dev", "start", "serve", "build", "test"} {
					if _, ok := scripts[name]; ok {
						add("npm "+name, profile.PackageManager+" run "+name)
					}
				}
			}
		}
	} else if hasProjectFile(root, "go.mod") {
		profile.Kind, profile.Label, profile.PackageManager = "go", "Go 项目", "go"
		profile.Signals = append(profile.Signals, "go.mod")
		add("运行 Go", "go run .")
		add("测试 Go", "go test ./...")
		add("构建 Go", "go build ./...")
	} else if hasProjectFile(root, "pom.xml") || hasProjectFile(root, "build.gradle") || hasProjectFile(root, "build.gradle.kts") {
		profile.Kind, profile.Label = "java", "Java 项目"
		profile.PackageManager = "Maven"
		profile.Signals = append(profile.Signals, "pom.xml")
		if hasProjectFile(root, "build.gradle") || hasProjectFile(root, "build.gradle.kts") {
			profile.PackageManager, profile.Signals = "Gradle", append(profile.Signals, "build.gradle")
		}
		if hasProjectFile(root, "mvnw") {
			add("运行 Spring Boot", "./mvnw spring-boot:run")
		} else if profile.PackageManager == "Gradle" && hasProjectFile(root, "gradlew") {
			add("运行 Spring Boot", "./gradlew bootRun")
		} else {
			add("构建 Java", "mvn package")
		}
		add("测试 Java", "mvn test")
	} else if hasProjectFile(root, "composer.json") {
		profile.Kind, profile.Label, profile.PackageManager = "php", "PHP 项目", "Composer"
		profile.Signals = append(profile.Signals, "composer.json")
		profile.InstallCommand = "composer install"
		add("安装依赖", profile.InstallCommand)
		add("启动 PHP 服务", "php -S 127.0.0.1:8000 -t public")
	} else if hasProjectFile(root, "pyproject.toml") || hasProjectFile(root, "requirements.txt") {
		profile.Kind, profile.Label, profile.PackageManager = "python", "Python 项目", "pip"
		profile.Signals = append(profile.Signals, "pyproject.toml")
		profile.InstallCommand = "python -m pip install -r requirements.txt"
		add("安装 Python 依赖", profile.InstallCommand)
		add("运行 Python", "python main.py")
	}
	return profile
}

func (g *Git) ProjectProfile(ctx context.Context, root string) (ProjectProfile, error) {
	if _, err := g.engine.DevelopmentPath(ctx, root, ""); err != nil {
		return ProjectProfile{}, err
	}
	return projectProfile(root), nil
}

func (g *Git) aiProvidersPath() (string, error) {
	if g.ephemeral {
		return "", errors.New("隔离测试模式不读取 AI 配置")
	}
	dir, err := mygo.App.Path(mygo.PathUserData)
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "ai-providers.json"), nil
}

func (g *Git) AIProviders(ctx context.Context) ([]AIProvider, error) {
	path, err := g.aiProvidersPath()
	if err != nil {
		return []AIProvider{}, err
	}
	g.developerMu.Lock()
	defer g.developerMu.Unlock()
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return []AIProvider{}, nil
	}
	if err != nil {
		return nil, err
	}
	var providers []AIProvider
	if json.Unmarshal(data, &providers) != nil {
		return nil, errors.New("AI 供应商配置损坏")
	}
	return providers, nil
}

func validateAIProvider(p AIProvider) error {
	if !aiProviderID.MatchString(p.ID) || strings.TrimSpace(p.Name) == "" || len(p.Name) > 100 || len(p.BaseURL) > 2000 || len(p.Model) > 200 || len(p.APIKey) > 1000 {
		return errors.New("AI 供应商配置无效")
	}
	if p.Enabled && (strings.TrimSpace(p.BaseURL) == "" || strings.TrimSpace(p.Model) == "") {
		return errors.New("启用 AI 供应商需要填写地址和模型")
	}
	return nil
}

func (g *Git) SaveAIProvider(ctx context.Context, provider AIProvider) error {
	if err := validateAIProvider(provider); err != nil {
		return err
	}
	path, err := g.aiProvidersPath()
	if err != nil {
		return err
	}
	providers, err := g.AIProviders(ctx)
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	found := false
	for i := range providers {
		if providers[i].ID == provider.ID {
			providers[i], found = provider, true
		}
	}
	if !found {
		providers = append(providers, provider)
	}
	sort.Slice(providers, func(i, j int) bool { return providers[i].Name < providers[j].Name })
	data, _ := json.MarshalIndent(providers, "", "  ")
	g.developerMu.Lock()
	defer g.developerMu.Unlock()
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	tmp := filepath.Join(filepath.Dir(path), ".ai-providers-"+rand.Text())
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return err
	}
	defer os.Remove(tmp)
	return os.Rename(tmp, path)
}

func providerEndpoint(base string) string {
	base = strings.TrimRight(strings.TrimSpace(base), "/")
	if strings.HasSuffix(base, "/chat/completions") {
		return base
	}
	return base + "/chat/completions"
}

func (g *Git) AnalyzeProject(ctx context.Context, root, providerID string) (ProjectAnalysis, error) {
	profile, err := g.ProjectProfile(ctx, root)
	if err != nil {
		return ProjectAnalysis{}, err
	}
	analysis := ProjectAnalysis{Profile: profile, Commands: profile.Commands, Notes: []string{"识别基于仓库清单文件，命令执行前仍需确认。"}}
	providers, err := g.AIProviders(ctx)
	if err != nil || providerID == "" {
		analysis.Summary = profile.Label + "，可先执行依赖安装或运行命令。"
		return analysis, nil
	}
	var provider *AIProvider
	for i := range providers {
		if providers[i].ID == providerID && providers[i].Enabled {
			provider = &providers[i]
		}
	}
	if provider == nil {
		return ProjectAnalysis{}, errors.New("AI 供应商未启用或不存在")
	}
	payload, _ := json.Marshal(map[string]any{
		"model": provider.Model,
		"temperature": 0.1,
		"messages": []map[string]string{
			{"role": "system", "content": "你是开发工具中的项目启动助手。只根据项目类型、清单文件和脚本名分析，不要索要或推断密钥。用简短中文回答启动顺序、风险和建议。"},
			{"role": "user", "content": fmt.Sprintf("项目资料：%s", string(mustJSON(profile)))},
		},
	})
	requestCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(requestCtx, http.MethodPost, providerEndpoint(provider.BaseURL), bytes.NewReader(payload))
	if err != nil {
		return ProjectAnalysis{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(provider.APIKey) != "" {
		req.Header.Set("Authorization", "Bearer "+provider.APIKey)
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		return ProjectAnalysis{}, errors.New("AI 请求失败，请检查供应商地址或网络")
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return ProjectAnalysis{}, fmt.Errorf("AI 供应商返回 HTTP %d", response.StatusCode)
	}
	var result struct {
		Choices []struct {
			Message struct{ Content string `json:"content"` } `json:"message"`
		} `json:"choices"`
	}
	if json.Unmarshal(body, &result) != nil || len(result.Choices) == 0 {
		return ProjectAnalysis{}, errors.New("AI 返回格式无法识别")
	}
	analysis.Provider = provider.Name
	analysis.Summary = strings.TrimSpace(result.Choices[0].Message.Content)
	return analysis, nil
}

func mustJSON(value any) []byte {
	data, _ := json.Marshal(value)
	return data
}
