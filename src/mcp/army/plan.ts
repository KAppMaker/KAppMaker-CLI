import { hasMentorPack, productName, type Entitlement } from './licence.js';

/**
 * The setup plan for exactly what the buyer bought, in plain words. It only
 * ever names their own product; nothing about products they did not buy.
 */
export function planText(ent: Entitlement, hadLicence: boolean, hasHost: boolean): string {
  const seats = Number.isFinite(ent.activationsMax)
    ? ` Your licence is installed on ${ent.activationsUsed} of ${ent.activationsMax} machines so far.` : '';

  if (ent.product === 'plugin') {
    return [
      hadLicence ? `You bought ${productName('plugin')}.` : 'No install code or licence key given, so this is the plan for App Army for Claude Code (the plugin). If you bought the full kit, give me the install code from "My purchase" instead.',
      'It runs inside Claude Code on your own computer, so you do not need a server.',
      '1. Accept the GitHub invite to KAppMaker/app-army-mod. It went to the GitHub account you gave at checkout.',
      '2. Make sure git can reach GitHub from this computer: gh auth login, then gh auth setup-git.',
      '3. Install it: army_install_plugin. It adds the private marketplace and installs the plugin, and needs Claude Code 2.1.330 or later.',
      '4. Restart Claude Code.',
      'Your purchase page also has a credit code worth what you paid, which you can put toward the full kit if you later want App Army running around the clock on a server.',
    ].join('\n');
  }

  const mentor = hasMentorPack(ent.product);
  const lines = [
    ent.product === 'unknown' ? `${ent.note}` : `You bought ${productName(ent.product)}.${seats}`,
    '',
    'On your own server (recommended: 4 vCPU, 8 GB RAM, 80 GB disk, Ubuntu 24.04), the simplest way is ONE tool: army_setup {host, ssh_key_path}.',
    'Call it again until it says READY; it does every step below in order and tells you when it needs you.',
    'The same steps one by one:',
    `1. army_check_server${hasHost ? '' : ' {host, user, ssh_key_path}'}: makes sure the server is reachable, big enough, and that you log in as root or with passwordless sudo.`,
    '2. army_install_server: runs the official installer. It turns on the security baseline and creates the worker user with limited sudo, then installs the tools, the kit, the kappmaker plugin and an always-on worker, and finishes with a health check.' +
      (mentor ? ' It also installs your mentor pack: the keyword bank, scored app ideas and the keyword tool, wired into the skills.' : ''),
    '3. army_claude_login: signs Claude Code in on the server. You open the link it gives you in your own browser.',
    '4. army_add_worker: connects your own Telegram bot. You paste the bot token on a private page on this computer (or in your own terminal); it never goes into the chat.',
    `5. army_pair_telegram: you send your bot one message and confirm it is you. The bot then writes first: "Your App Army is ready. Tell me your app idea."`,
    '6. Tell the bot your app idea on Telegram. army_doctor checks health; army_status shows what is running.',
    '',
    'No server? The same kit runs on this laptop: in a terminal, `kappmaker army install`. Use your install code when it asks.',
  ];
  if (ent.product === 'build-with-me') {
    lines.push('', 'Build With Me: book your sessions from "My purchase" on kappmaker.com. Bring your app idea; we set it up and build it together.');
  }
  lines.push('', 'Each step that changes something shows its plan first and runs only after you say yes.');
  return lines.join('\n');
}
