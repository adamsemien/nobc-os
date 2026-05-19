/** Command Registry entrypoint.
 *  Importing this module registers every command as a side effect. The Cmd+K
 *  palette imports from here. Adding a command = one new file + one line here. */

import './theme/switch-light';
import './theme/switch-midnight';
import './theme/switch-obsidian';
import './theme/switch-rose';
import './theme/switch-parchment';
import './theme/switch-void';
import './theme/switch-ember';
import './theme/switch-y2k';
import './theme/switch-aim';
import './theme/switch-myspace';

import './navigation/go-to-applications';
import './navigation/go-to-intelligence';
import './navigation/go-to-events';
import './navigation/go-to-audit';
import './navigation/go-to-webhooks';

export * from './types';
export * from './registry';
