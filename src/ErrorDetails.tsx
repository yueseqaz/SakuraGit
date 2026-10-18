export function redactGitError(text: string) {
  return text
    .replace(/(https?:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, '$1[凭据已隐藏]@')
    .replace(
      /([?&](?:oauth_token|private_token|client_secret|api_key|auth|key)=)[^&#\s]+/gi,
      '$1[已隐藏]',
    )
    .replace(
      /((?:authorization|private-token|access_token|password|passwd|token|secret)\s*[:=]\s*)(?:Bearer\s+|Basic\s+)?[^\s&]+/gi,
      '$1[已隐藏]',
    )
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{15,})\b/g, '[Token 已隐藏]')
    .slice(-16000);
}
export function describeGitError(error: unknown) {
  const raw = redactGitError(error instanceof Error ? error.message : String(error));
  const rules: [RegExp, string, string, string][] = [
    [
      /cancel|取消/i,
      'canceled',
      '操作已取消',
      '取消不等于回滚；请刷新检查文件、提交或远程状态，不要直接重复执行。',
    ],
    [
      /certificate|SSL|TLS|证书/i,
      'tls',
      '服务器证书验证失败',
      '检查系统时间、企业证书和代理配置。不要关闭 SSL 证书校验。',
    ],
    [
      /host key verification|REMOTE HOST IDENTIFICATION/i,
      'host-key',
      'SSH 主机指纹尚未确认或已变化',
      '在终端核对服务器指纹并完成确认；不要直接删除 known_hosts 或跳过校验。',
    ],
    [
      /publickey|sign_and_send_pubkey|agent refused/i,
      'ssh',
      'SSH 身份验证失败',
      '检查 ssh-agent 是否加载正确密钥、公钥是否添加到服务端，以及账号的仓库权限。',
    ],
    [
      /403|access denied|not allowed|permission denied|forbidden/i,
      'permission',
      '没有执行此操作的权限',
      '确认当前凭据所属账号和仓库读写权限。能克隆不代表有推送权限；本软件不保存密码。',
    ],
    [
      /401|authentication failed|could not read (?:Username|Password)|terminal prompts disabled|invalid credentials/i,
      'authentication',
      '登录凭据缺失或失效',
      '请通过系统 Git 凭据助手、钥匙串或终端完成登录后再试。不要把密码或 Token 放进仓库地址。',
    ],
    [
      /could not resolve|name or service not known|无法解析/i,
      'dns',
      '无法解析服务器地址',
      '检查地址拼写、DNS、VPN 或企业网络；先确认网络可达。',
    ],
    [
      /timed?\s*out|deadline exceeded|超时|超过 30 分钟/i,
      'timeout',
      '操作等待超时',
      '检查网络、VPN、代理或凭据弹窗。操作可能已部分完成，请先刷新检查实际状态。',
    ],
    [
      /failed to connect|connection (?:refused|reset|closed)|network is unreachable/i,
      'connection',
      '无法连接远程服务器',
      '检查服务器、网络、VPN 和代理。不会自动重试提交或推送。',
    ],
    [
      /non-fast-forward|diverg|not possible to fast-forward|fetch first|分叉|尚未整合/i,
      'diverged',
      '本地与远程历史需要先整合',
      '先 Fetch 查看双方提交，再选择合并处理；不会自动强推或覆盖远程。',
    ],
    [
      /index\.lock|another git process/i,
      'locked',
      '仓库被其他 Git 进程占用',
      '先等待终端、编辑器或其他 Git 工具完成操作，不要直接删除锁文件。',
    ],
    [
      /gpg|signing failed|签名/i,
      'signing',
      '提交签名未完成',
      '检查 GPG / SSH 签名配置、密钥和系统授权弹窗。先确认是否已产生提交，再决定是否重试。',
    ],
    [
      /hook|pre-commit|pre-push/i,
      'hook',
      'Git hook 拒绝或中断了操作',
      '查看原始错误并修复项目检查；不会跳过 hooks。',
    ],
    [
      /dubious ownership|safe\.directory/i,
      'ownership',
      'Git 拒绝了仓库所有权',
      '核实仓库所有者后，在终端为这个可信目录配置 safe.directory；不要全局信任所有目录。',
    ],
    [
      /no space left|disk full/i,
      'disk',
      '磁盘空间不足',
      '释放空间后检查仓库状态，不要直接删除 .git 中的文件。',
    ],
  ];
  for (const [pattern, code, title, hint] of rules)
    if (pattern.test(raw)) return { raw, code, title, hint };
  return {
    raw,
    code: 'git',
    title: '操作未完成',
    hint: '请查看错误详情并刷新仓库检查实际状态；不会自动重试可能改变仓库的操作。',
  };
}
export function ErrorDetails({ message, alert = true }: { message: unknown; alert?: boolean }) {
  const info = describeGitError(message);
  return (
    <div className="git-error" role={alert ? 'alert' : undefined}>
      <strong>{info.title}</strong>
      <p>{info.hint}</p>
      <details>
        <summary>查看错误详情</summary>
        <pre>{info.raw}</pre>
      </details>
    </div>
  );
}
