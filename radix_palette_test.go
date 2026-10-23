package main

import "testing"

func TestRadixWorkbenchAndTerminalRoles(t *testing.T) {
	for _, palette := range []string{"mist", "graphite", "forest", "sand"} {
		light, dark := terminalPalette(palette)
		for _, isDark := range []bool{false, true} {
			neutral, accent := paletteScales(palette)
			theme := workbenchTheme(palette, isDark)
			term := light
			if isDark {
				term = dark
			}
			if theme.Dark != isDark || theme.Background != radixColor(neutral, 1, isDark) || theme.Text != radixColor(neutral, 12, isDark) {
				t.Fatal("incorrect native surface/text roles", palette, isDark)
			}
			if theme.Border != radixColor(neutral, 7, isDark) || theme.Focus != radixColor(accent, 8, isDark) || theme.FontSize != 12 || theme.Radius != 4 {
				t.Fatal("incorrect native control roles", palette, isDark)
			}
			if term.Foreground != theme.Text || term.Background != radixColor(neutral, 2, isDark) || term.Palette[1] != radixColor("red", 11, isDark) {
				t.Fatal("terminal defaults diverge from Radix", palette, isDark)
			}
			if theme.Accent == theme.AccentText {
				t.Fatal("unreadable primary button", palette, isDark)
			}
		}
	}
}
