package devtools

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestEnvironmentSelectionAndOverrides(t *testing.T) {
	values := ParseEnvironment([]byte("PATH=/bin\x00JAVA_HOME=/jdk with space\x00SECRET_TOKEN=do-not-display\x00EMPTY=\x00BAD\x00"))
	variables := selectedVariables(values)
	if len(variables) != 2 || variables[1].Value != "/jdk with space" {
		t.Fatal(variables)
	}
	merged := Merge(variables, []Variable{{"PATH", "/custom"}, {"APP_MODE", "dev=local"}})
	if len(merged) != 3 || merged[0].Value != "/custom" || variables[0].Value != "/bin" {
		t.Fatal("mutated captured environment", variables, merged)
	}
	if strings.Contains(strings.Join(Env(merged), "\x00"), "APP_MODE=dev=local") == false {
		t.Fatal("lost equals sign")
	}
}
func TestDiscoveryIgnoresRelativePathsAndResolvesHomeBins(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "bin")
	if err := os.Mkdir(bin, 0700); err != nil {
		t.Fatal(err)
	}
	name := "java"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	if err := os.WriteFile(filepath.Join(bin, name), []byte("fixture"), 0700); err != nil {
		t.Fatal(err)
	}
	if Find("java", []Variable{{"PATH", "." + string(os.PathListSeparator) + "bin"}}) != "" {
		t.Fatal("searched relative PATH")
	}
	variables := EffectiveVariables(nil, []Variable{{"JAVA_HOME", dir}})
	if Find("java", variables) != filepath.Join(bin, name) {
		t.Fatal(variables)
	}
}
func TestCommandRunsLiteralScriptWithEnvironmentAndCWD(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX fixture; Windows argument construction checked separately")
	}
	dir := t.TempDir()
	args := Command("/bin/sh", `printf '%s\n' "$APP_FIXTURE"; pwd; exit 7`)
	cmd := exec.CommandContext(context.Background(), args[0], args[1:]...)
	cmd.Dir, cmd.Env = dir, Env([]Variable{{"APP_FIXTURE", "space ' quote = value"}})
	data, err := cmd.CombinedOutput()
	exit, ok := err.(*exec.ExitError)
	if !ok || exit.ExitCode() != 7 || !strings.Contains(string(data), "space ' quote = value") {
		t.Fatal(string(data), err)
	}
	actual, _ := filepath.EvalSymlinks(dir)
	if !strings.Contains(string(data), actual) && !strings.Contains(string(data), dir) {
		t.Fatal("wrong command directory", string(data))
	}
}
func TestCommandDoesNotInterpolateUserScript(t *testing.T) {
	script := "echo 'a'; echo \"b\"\nexit 9"
	args := Command("fixture-shell", script)
	if args[len(args)-1] != script || args[0] != "fixture-shell" {
		t.Fatal(args)
	}
}
