package gitrepo

type File struct {
	Path       string `json:"path"`
	OldPath    string `json:"oldPath"`
	Index      string `json:"index"`
	Worktree   string `json:"worktree"`
	Untracked  bool   `json:"untracked"`
	Conflicted bool   `json:"conflicted"`
}

type Branch struct {
	Name     string `json:"name"`
	Current  bool   `json:"current"`
	Remote   bool   `json:"remote"`
	Upstream string `json:"upstream"`
	Subject  string `json:"subject"`
}

type Commit struct {
	Hash        string   `json:"hash"`
	Short       string   `json:"short"`
	Parents     []string `json:"parents"`
	Subject     string   `json:"subject"`
	Author      string   `json:"author"`
	AuthorEmail string   `json:"authorEmail"`
	Date        string   `json:"date"`
	Refs        string   `json:"refs"`
}

type CommitFile struct {
	Path      string `json:"path"`
	OldPath   string `json:"oldPath"`
	Status    string `json:"status"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
	Binary    bool   `json:"binary"`
}

type HistoryPage struct {
	Commits    []Commit `json:"commits"`
	HasMore    bool     `json:"hasMore"`
	NextOffset int      `json:"nextOffset"`
	Revision   string   `json:"revision"`
}

type RemoteBranches struct {
	Branches      []string `json:"branches"`
	DefaultBranch string   `json:"defaultBranch"`
}

type CommitDetails struct {
	Commit         Commit       `json:"commit"`
	Body           string       `json:"body"`
	Committer      string       `json:"committer"`
	CommitterEmail string       `json:"committerEmail"`
	CommittedAt    string       `json:"committedAt"`
	Files          []CommitFile `json:"files"`
}

type Worktree struct {
	Path     string `json:"path"`
	Branch   string `json:"branch"`
	Detached bool   `json:"detached"`
}

type Snapshot struct {
	Root            string     `json:"root"`
	Name            string     `json:"name"`
	Branch          string     `json:"branch"`
	Upstream        string     `json:"upstream"`
	UpstreamRemote  string     `json:"upstreamRemote"`
	UpstreamBranch  string     `json:"upstreamBranch"`
	Ahead           int        `json:"ahead"`
	Behind          int        `json:"behind"`
	Unborn          bool       `json:"unborn"`
	Detached        bool       `json:"detached"`
	State           string     `json:"state"`
	Files           []File     `json:"files"`
	Branches        []Branch   `json:"branches"`
	Commits         []Commit   `json:"commits"`
	HistoryHasMore  bool       `json:"historyHasMore"`
	HistoryRevision string     `json:"historyRevision"`
	Worktrees       []Worktree `json:"worktrees"`
	Remotes         []string   `json:"remotes"`

	Stashes []Stash `json:"stashes"`
}

type Diff struct {
	Path     string `json:"path"`
	Text     string `json:"text"`
	Binary   bool   `json:"binary"`
	Revision string `json:"revision"`
	Hunks    []Hunk `json:"hunks"`
}

type Hunk struct {
	ID     int    `json:"id"`
	Line   int    `json:"line"`
	Header string `json:"header"`
}

type Stash struct {
	Ref     string `json:"ref"`
	Hash    string `json:"hash"`
	Subject string `json:"subject"`
	Date    string `json:"date"`
}

type RemoteInfo struct {
	Name      string   `json:"name"`
	FetchURLs []string `json:"fetchURLs"`
	PushURLs  []string `json:"pushURLs"`
	Revision  string   `json:"revision"`
}

type Diagnostics struct {
	Version          string `json:"version"`
	Name             string `json:"name"`
	Email            string `json:"email"`
	CredentialHelper bool   `json:"credentialHelper"`
	CustomSSH        bool   `json:"customSSH"`
}

type Result struct {
	Output string `json:"output"`
}
