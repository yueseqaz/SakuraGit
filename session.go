package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"github.com/egoist/mygo"
)

type CommitDraft struct {
	Title string `json:"title"`
	Body  string `json:"body"`
}
type WorkspaceSession struct {
	Root      string                 `json:"root"`
	View      string                 `json:"view"`
	Kind      string                 `json:"kind"`
	Path      string                 `json:"path"`
	Hash      string                 `json:"hash"`
	Staged    bool                   `json:"staged"`
	Search    string                 `json:"search"`
	Drafts    map[string]CommitDraft `json:"drafts"`
	UpdatedAt int64                  `json:"updatedAt"`
}

func emptySession() WorkspaceSession {
	return WorkspaceSession{View: "changes", Drafts: map[string]CommitDraft{}}
}
func validateSession(s WorkspaceSession) error {
	if s.UpdatedAt < 0 || len(s.Drafts) > 64 || len(s.Root) > 4096 || len(s.Path) > 4096 || len(s.Search) > 1000 || len(s.Hash) > 64 || strings.ContainsAny(s.Root+s.Path, "\x00") {
		return errors.New("无效的工作区会话")
	}
	if s.Root != "" && !filepath.IsAbs(s.Root) {
		return errors.New("会话仓库必须是绝对路径")
	}
	if s.View != "changes" && s.View != "history" && s.View != "worktrees" && s.View != "stashes" && s.View != "remotes" && s.View != "workflow" && s.View != "recovery" {
		return errors.New("无效的会话页面")
	}
	if s.Kind != "" && s.Kind != "file" && s.Kind != "commit" && s.Kind != "stash" {
		return errors.New("无效的会话选择")
	}
	for root, draft := range s.Drafts {
		if !filepath.IsAbs(root) || len(root) > 4096 || len(draft.Title) > 1000 || len(draft.Body) > 72000 {
			return errors.New("提交草稿超过限制")
		}
	}
	return nil
}
func readSession(path string) WorkspaceSession {
	s := emptySession()
	data, err := os.ReadFile(path)
	if err != nil || len(data) > 6<<20 || json.Unmarshal(data, &s) != nil || validateSession(s) != nil {
		return emptySession()
	}
	if s.Drafts == nil {
		s.Drafts = map[string]CommitDraft{}
	}
	return s
}
func writeSession(path string, s WorkspaceSession) error {
	if err := validateSession(s); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	data, err := json.Marshal(s)
	if err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".session-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if _, err = file.Write(data); err != nil {
		file.Close()
		return err
	}
	if err = file.Sync(); err != nil {
		file.Close()
		return err
	}
	if err = file.Close(); err != nil {
		return err
	}
	return os.Rename(file.Name(), path)
}
func sessionPath() (string, error) {
	dir, err := mygo.App.Path(mygo.PathUserData)
	return filepath.Join(dir, "workspace-session.json"), err
}
func (g *Git) sessionStoragePath() (string, error) {
	if g.sessionFile != "" {
		return g.sessionFile, nil
	}
	return sessionPath()
}
func (g *Git) SaveSession(s WorkspaceSession) error {
	if err := validateSession(s); err != nil {
		return err
	}
	g.sessionMu.Lock()
	defer g.sessionMu.Unlock()
	if g.ephemeral {
		return nil
	}
	path, err := g.sessionStoragePath()
	if err != nil {
		return err
	}
	if current := readSession(path); current.UpdatedAt > s.UpdatedAt {
		return nil
	}
	return writeSession(path, s)
}
