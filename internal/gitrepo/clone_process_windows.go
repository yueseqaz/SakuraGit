package gitrepo

import (
	"os/exec"
	"strconv"
)

func configureCloneProcess(cmd *exec.Cmd) {
	cmd.Cancel = func() error {
		return exec.Command("taskkill", "/F", "/T", "/PID", strconv.Itoa(cmd.Process.Pid)).Run()
	}
}
