//go:build !windows

package gitrepo

import (
	"os"
	"os/exec"
	"syscall"
)

func configureCloneProcess(cmd *exec.Cmd) {
	// Kill Git's credential/transport/index-pack children as well as its parent.
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error {
		err := syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		if err == syscall.ESRCH {
			return os.ErrProcessDone
		}
		return err
	}
}
