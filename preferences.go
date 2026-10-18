package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"

	"github.com/egoist/mygo"
)

type Preferences struct {
	Palette    string `json:"palette"`
	Appearance string `json:"appearance"`
	CodeSize   int    `json:"codeSize"`
}

var settingsRequested = mygo.NewEvent[bool]("settings-requested")

func defaultPreferences() Preferences {
	return Preferences{Palette: "mist", Appearance: "system", CodeSize: 12}
}

func validatePreferences(p Preferences) error {
	if (p.Palette != "mist" && p.Palette != "graphite") || (p.Appearance != "system" && p.Appearance != "light" && p.Appearance != "dark") || p.CodeSize < 11 || p.CodeSize > 16 {
		return errors.New("无效的外观设置")
	}
	return nil
}

func preferencesPath() (string, error) {
	dir, err := mygo.App.Path(mygo.PathUserData)
	return filepath.Join(dir, "preferences.json"), err
}

func loadPreferences() Preferences {
	path, err := preferencesPath()
	if err != nil {
		return defaultPreferences()
	}
	return readPreferences(path)
}

func readPreferences(path string) Preferences {
	p := defaultPreferences()
	data, err := os.ReadFile(path)
	if err != nil {
		return p
	}
	var saved Preferences
	if json.Unmarshal(data, &saved) == nil && validatePreferences(saved) == nil {
		return saved
	}
	return p
}

func (g *Git) Preferences() Preferences {
	if g.ephemeral {
		return defaultPreferences()
	}
	return loadPreferences()
}

func (g *Git) SavePreferences(p Preferences) error {
	if err := validatePreferences(p); err != nil {
		return err
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	if !g.ephemeral {
		path, err := preferencesPath()
		if err != nil {
			return err
		}
		if err = writePreferences(path, p); err != nil {
			return err
		}
	}
	mygo.Theme.SetSource(mygo.ThemeSource(p.Appearance))
	return nil
}

func writePreferences(path string, p Preferences) error {
	if err := validatePreferences(p); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".preferences-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if _, err = file.Write(data); err != nil {
		file.Close()
		return err
	}
	if err = file.Close(); err != nil {
		return err
	}
	return os.Rename(file.Name(), path)
}

func (g *Git) CopyText(text string) error {
	if len(text) > 4096 {
		return errors.New("文本过长")
	}
	mygo.Clipboard.WriteText(text)
	return nil
}
