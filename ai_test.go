package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestProjectProfileDetectsNodeScriptsAndPackageManager(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "package.json"), []byte(`{"scripts":{"dev":"vite","build":"vite build"}}`), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "pnpm-lock.yaml"), []byte("lockfileVersion: 9"), 0600); err != nil {
		t.Fatal(err)
	}
	p := projectProfile(root)
	if p.Kind != "node" || p.PackageManager != "pnpm" || p.InstallCommand != "pnpm install" {
		t.Fatalf("unexpected node profile: %+v", p)
	}
	if len(p.Commands) != 3 || p.Commands[1].Command != "pnpm run dev" {
		t.Fatalf("unexpected detected commands: %+v", p.Commands)
	}
}

func TestProjectProfileDetectsGo(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "go.mod"), []byte("module example"), 0600); err != nil {
		t.Fatal(err)
	}
	p := projectProfile(root)
	if p.Kind != "go" || len(p.Commands) != 3 {
		t.Fatalf("unexpected Go profile: %+v", p)
	}
}

func TestProviderEndpointSupportsOpenAICompatibleBaseURLs(t *testing.T) {
	if got := providerEndpoint("http://localhost:11434/v1/"); got != "http://localhost:11434/v1/chat/completions" {
		t.Fatal(got)
	}
	if got := providerEndpoint("https://example.test/chat/completions"); got != "https://example.test/chat/completions" {
		t.Fatal(got)
	}
}
