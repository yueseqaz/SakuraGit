package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPreferencesValidation(t *testing.T) {
	for _, palette := range []string{"mist", "graphite", "forest", "sand"} {
		for _, mode := range []string{"system", "light", "dark"} {
			if err := validatePreferences(Preferences{palette, mode, 12}); err != nil {
				t.Fatal(palette, mode, err)
			}
			light, dark := terminalPalette(palette)
			if light.Background == dark.Background || light.Foreground == light.Background || dark.Foreground == dark.Background {
				t.Fatal("invalid terminal theme", palette)
			}
		}
	}
	if err := validatePreferences(defaultPreferences()); err != nil {
		t.Fatal(err)
	}
	for _, p := range []Preferences{{"wrong", "system", 12}, {"mist", "wrong", 12}, {"mist", "dark", 200}, {"graphite", "light", 0}} {
		if validatePreferences(p) == nil {
			t.Fatalf("accepted invalid settings: %+v", p)
		}
	}
}

func TestPreferencesPersistence(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings", "preferences.json")
	if readPreferences(path) != defaultPreferences() {
		t.Fatal("missing file must use defaults")
	}
	p := Preferences{Palette: "graphite", Appearance: "dark", CodeSize: 14}
	if err := writePreferences(path, p); err != nil {
		t.Fatal(err)
	}
	if readPreferences(path) != p {
		t.Fatal("settings did not survive roundtrip")
	}
	if err := writePreferences(path, Preferences{}); err == nil {
		t.Fatal("invalid settings accepted")
	}
	if readPreferences(path) != p {
		t.Fatal("failed save changed persisted settings")
	}
	if err := os.WriteFile(path, []byte("broken"), 0600); err != nil {
		t.Fatal(err)
	}
	if readPreferences(path) != defaultPreferences() {
		t.Fatal("malformed settings must use defaults")
	}
}

func TestLegacyCodeSizesMigrate(t *testing.T) {
	path := filepath.Join(t.TempDir(), "preferences.json")
	for _, size := range []int{11, 12, 13, 14, 15, 16} {
		p := Preferences{Palette: "sand", Appearance: "dark", CodeSize: size}
		if err := writePreferences(path, p); err != nil {
			t.Fatal(err)
		}
		got := readPreferences(path)
		if got != normalizePreferences(p) {
			t.Fatalf("legacy size %d: %+v", size, got)
		}
	}
}
