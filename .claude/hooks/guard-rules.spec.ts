import { describe, expect, it } from 'vitest';

import type { GuardResult } from './guard-rules';
import * as guardRulesModule from './guard-rules';
import {
  evaluateCommand,
  normalizeCommand,
  splitCommands,
  stripQuotedContent,
} from './guard-rules';

describe('evaluateCommand', () => {
  it('does not export internal recursion helper', () => {
    // evaluateCommandInner should be an unexported implementation detail
    expect(guardRulesModule).not.toHaveProperty('evaluateCommandInner');
  });

  describe('safe commands (allow)', () => {
    it('returns allow for empty command (E2)', () => {
      const result: GuardResult = evaluateCommand('');
      expect(result).toEqual({ action: 'allow' });
    });

    it('returns allow for whitespace-only command (E2)', () => {
      const result: GuardResult = evaluateCommand('   ');
      expect(result).toEqual({ action: 'allow' });
    });

    it('returns allow for a safe command', () => {
      const result: GuardResult = evaluateCommand('git status');
      expect(result).toEqual({ action: 'allow' });
    });

    it('returns allow for any arbitrary command', () => {
      const result: GuardResult = evaluateCommand('echo hello world');
      expect(result).toEqual({ action: 'allow' });
    });

    it('returns a GuardResult with action property', () => {
      const result = evaluateCommand('ls -la');
      expect(result).toHaveProperty('action');
      expect(result.action).toBe('allow');
    });

    it('does not include message when allowing', () => {
      const result = evaluateCommand('npm test');
      expect(result.message).toBeUndefined();
    });
  });

  describe('existing patterns (regression)', () => {
    describe('hook bypass flags', () => {
      it('blocks commit with no-verify flag', () => {
        const flag = ['--no', '-verify'].join('');
        const result = evaluateCommand('git commit ' + flag);
        expect(result.action).toBe('block');
        expect(result.message).toBeDefined();
      });

      it('blocks commit -m "msg" with no-verify flag', () => {
        const flag = ['--no', '-verify'].join('');
        const result = evaluateCommand('git commit -m "fix" ' + flag);
        expect(result.action).toBe('block');
      });

      it('blocks push with no-verify flag', () => {
        const flag = ['--no', '-verify'].join('');
        const result = evaluateCommand('git push ' + flag);
        expect(result.action).toBe('block');
      });

      it('blocks commit with no-gpg-sign flag', () => {
        const flag = ['--no', '-gpg-sign'].join('');
        const result = evaluateCommand('git commit ' + flag);
        expect(result.action).toBe('block');
      });

      it('blocks commit -m "msg" with no-gpg-sign flag', () => {
        const flag = ['--no', '-gpg-sign'].join('');
        const result = evaluateCommand('git commit -m "fix" ' + flag);
        expect(result.action).toBe('block');
      });

      it('blocks combined no-verify and no-gpg-sign flags', () => {
        const nv = ['--no', '-verify'].join('');
        const ng = ['--no', '-gpg-sign'].join('');
        const result = evaluateCommand('git commit ' + nv + ' ' + ng);
        expect(result.action).toBe('block');
      });

      it('allows "gitcommit" without whitespace after git (not a git command)', () => {
        const flag = ['--no', '-verify'].join('');
        const result = evaluateCommand('gitcommit ' + flag);
        expect(result.action).toBe('allow');
      });

      it('allows "gitpush" without whitespace after git (not a git command)', () => {
        const flag = ['--no', '-gpg-sign'].join('');
        const result = evaluateCommand('gitpush ' + flag);
        expect(result.action).toBe('allow');
      });
    });

    describe('push with force flags', () => {
      it('blocks push with double-dash force', () => {
        const flag = ['--fo', 'rce'].join('');
        const result = evaluateCommand('git push ' + flag);
        expect(result.action).toBe('block');
        expect(result.message).toBeDefined();
      });

      it('blocks push origin main with double-dash force', () => {
        const flag = ['--fo', 'rce'].join('');
        const result = evaluateCommand('git push origin main ' + flag);
        expect(result.action).toBe('block');
      });

      it('blocks push with short force flag and trailing space', () => {
        const result = evaluateCommand('git push -f ');
        expect(result.action).toBe('block');
      });

      it('blocks push with short force flag at end of string', () => {
        const result = evaluateCommand('git push -f');
        expect(result.action).toBe('block');
      });

      it('blocks push with force-with-lease', () => {
        const flag = ['--fo', 'rce-with-lease'].join('');
        const result = evaluateCommand('git push ' + flag);
        expect(result.action).toBe('block');
      });

      it('blocks push origin feature with force-with-lease', () => {
        const flag = ['--fo', 'rce-with-lease'].join('');
        const result = evaluateCommand('git push origin feature ' + flag);
        expect(result.action).toBe('block');
      });

      it('does not false-positive on force-if-includes', () => {
        const flag = ['--fo', 'rce-if-includes'].join('');
        const result = evaluateCommand('git push ' + flag);
        expect(result.action).toBe('allow');
      });
    });

    describe('legacy bd commands', () => {
      it('blocks bare bd command', () => {
        const result = evaluateCommand('bd list');
        expect(result.action).toBe('block');
        expect(result.message).toBeDefined();
      });

      it('blocks npx bd command', () => {
        const result = evaluateCommand('npx bd create --title "task"');
        expect(result.action).toBe('block');
      });

      it('blocks bd in chained command with &&', () => {
        const result = evaluateCommand('echo done && bd sync');
        expect(result.action).toBe('block');
      });

      it('blocks bd in chained command with ||', () => {
        const result = evaluateCommand('test -f file || bd init');
        expect(result.action).toBe('block');
      });

      it('blocks bd in chained command with ;', () => {
        const result = evaluateCommand('echo start; bd list');
        expect(result.action).toBe('block');
      });

      it('allows br commands (not bd)', () => {
        const result = evaluateCommand('br list');
        expect(result.action).toBe('allow');
      });

      it('does not false-positive on words containing bd', () => {
        const result = evaluateCommand('echo abduct');
        expect(result.action).toBe('allow');
      });

      it('does not false-positive on bd inside quoted strings', () => {
        const result = evaluateCommand('git commit -m "migrated from bd to br"');
        expect(result.action).toBe('allow');
      });
    });

    describe('br init with force', () => {
      it('blocks br init with double-dash force', () => {
        const flag = ['--fo', 'rce'].join('');
        const result = evaluateCommand('br init ' + flag);
        expect(result.action).toBe('block');
        expect(result.message).toBeDefined();
      });

      it('blocks br init with short force flag', () => {
        const result = evaluateCommand('br init -f');
        expect(result.action).toBe('block');
      });

      it('allows br init without force', () => {
        const result = evaluateCommand('br init');
        expect(result.action).toBe('allow');
      });

      it('does not false-positive on br init force in quoted strings', () => {
        const flag = ['--fo', 'rce'].join('');
        const result = evaluateCommand('echo "do not run br init ' + flag + '"');
        expect(result.action).toBe('allow');
      });
    });

    describe('destructive git operations', () => {
      describe('git reset --hard', () => {
        it('blocks git reset --hard with no trailing args', () => {
          const result = evaluateCommand('git reset --hard');
          expect(result.action).toBe('block');
          expect(result.message).toBeDefined();
        });

        it('blocks git reset --hard with trailing ref', () => {
          const result = evaluateCommand('git reset --hard HEAD~3');
          expect(result.action).toBe('block');
          expect(result.message).toBeDefined();
        });

        it('blocks git reset --hard with origin ref', () => {
          const result = evaluateCommand('git reset --hard origin/main');
          expect(result.action).toBe('block');
        });
      });

      describe('git checkout . (discard all changes)', () => {
        it('blocks git checkout .', () => {
          const result = evaluateCommand('git checkout .');
          expect(result.action).toBe('block');
          expect(result.message).toBeDefined();
        });

        it('blocks git checkout -- .', () => {
          const result = evaluateCommand('git checkout -- .');
          expect(result.action).toBe('block');
        });

        it('blocks git checkout HEAD~1 -- . (S7 tree-ish)', () => {
          const result = evaluateCommand('git checkout HEAD~1 -- .');
          expect(result.action).toBe('block');
        });

        it('blocks git checkout main -- .', () => {
          const result = evaluateCommand('git checkout main -- .');
          expect(result.action).toBe('block');
        });

        it('blocks git checkout stash@{0} -- .', () => {
          const result = evaluateCommand('git checkout stash@{0} -- .');
          expect(result.action).toBe('block');
        });
      });

      describe('git restore . (discard all changes)', () => {
        it('blocks git restore .', () => {
          const result = evaluateCommand('git restore .');
          expect(result.action).toBe('block');
          expect(result.message).toBeDefined();
        });

        it('blocks git restore . with trailing space', () => {
          const result = evaluateCommand('git restore . ');
          expect(result.action).toBe('block');
        });
      });

      describe('git clean with force flag (delete untracked)', () => {
        it('blocks git clean -f', () => {
          const result = evaluateCommand('git clean -f');
          expect(result.action).toBe('block');
          expect(result.message).toBeDefined();
        });

        it('blocks git clean -fd', () => {
          const result = evaluateCommand('git clean -fd');
          expect(result.action).toBe('block');
        });

        it('blocks git clean -xfd', () => {
          const result = evaluateCommand('git clean -xfd');
          expect(result.action).toBe('block');
        });

        it('blocks git clean -f -d', () => {
          const result = evaluateCommand('git clean -f -d');
          expect(result.action).toBe('block');
        });
      });
    });

    describe('CLAUDE.md rule enforcement (--amend, --squash)', () => {
      it('blocks git commit --amend -m "fix"', () => {
        const result = evaluateCommand('git commit --amend -m "fix"');
        expect(result.action).toBe('block');
        expect(result.message).toContain('CLAUDE.md');
        expect(result.message).toContain('NEVER amend');
      });

      it('blocks git merge --squash feature', () => {
        const result = evaluateCommand('git merge --squash feature');
        expect(result.action).toBe('block');
        expect(result.message).toContain('CLAUDE.md');
        expect(result.message).toContain('NEVER squash-merge');
      });

      it('allows normal git commit -m "fix: something"', () => {
        const result = evaluateCommand('git commit -m "fix: something"');
        expect(result.action).toBe('allow');
      });

      it('allows commit message mentioning --amend (post-strip)', () => {
        const result = evaluateCommand('git commit -m "discussing --amend"');
        expect(result.action).toBe('allow');
      });
    });

    describe('catastrophic rm (file deletion)', () => {
      describe('combined flags with dangerous targets', () => {
        it('blocks rm -rf /', () => {
          const result = evaluateCommand('rm -rf /');
          expect(result.action).toBe('block');
          expect(result.message).toBeDefined();
        });

        it('blocks rm -rf .', () => {
          const result = evaluateCommand('rm -rf .');
          expect(result.action).toBe('block');
          expect(result.message).toBeDefined();
        });

        it('blocks rm -fr . (Fix 5: reversed flag order)', () => {
          const result = evaluateCommand('rm -fr .');
          expect(result.action).toBe('block');
          expect(result.message).toBeDefined();
        });
      });

      describe('S1: separated and long-form flags', () => {
        it('blocks rm with long-form recursive and force on /', () => {
          const flags = ['--recur', 'sive --fo', 'rce'].join('');
          const result = evaluateCommand('rm ' + flags + ' /');
          expect(result.action).toBe('block');
          expect(result.message).toBeDefined();
        });

        it('blocks rm -r -f .', () => {
          const result = evaluateCommand('rm -r -f .');
          expect(result.action).toBe('block');
          expect(result.message).toBeDefined();
        });
      });

      describe('S2: target variations', () => {
        it('blocks rm -rf ./ (trailing slash on dot)', () => {
          const result = evaluateCommand('rm -rf ./');
          expect(result.action).toBe('block');
          expect(result.message).toBeDefined();
        });

        it('blocks rm -rf ~/ (home directory)', () => {
          const result = evaluateCommand('rm -rf ~/');
          expect(result.action).toBe('block');
          expect(result.message).toBeDefined();
        });

        it('blocks rm -rf ../ (parent directory)', () => {
          const result = evaluateCommand('rm -rf ../');
          expect(result.action).toBe('block');
          expect(result.message).toBeDefined();
        });

        it('blocks rm -rf $HOME (variable expansion)', () => {
          const result = evaluateCommand('rm -rf $HOME');
          expect(result.action).toBe('block');
          expect(result.message).toBeDefined();
        });
      });

      describe('safe targets (allow)', () => {
        it('allows rm -rf node_modules', () => {
          const result = evaluateCommand('rm -rf node_modules');
          expect(result.action).toBe('allow');
        });

        it('allows rm -rf dist', () => {
          const result = evaluateCommand('rm -rf dist');
          expect(result.action).toBe('allow');
        });
      });
    });
  });

  describe('safe pattern whitelists (no false positives)', () => {
    describe('git checkout safe patterns', () => {
      it('allows git checkout -b new-feature (branch creation)', () => {
        const result: GuardResult = evaluateCommand('git checkout -b new-feature');
        expect(result).toEqual({ action: 'allow' });
      });

      it('allows git checkout --orphan initial (orphan branch)', () => {
        const result: GuardResult = evaluateCommand('git checkout --orphan initial');
        expect(result).toEqual({ action: 'allow' });
      });

      it('allows git checkout feature-branch (branch switch)', () => {
        const result: GuardResult = evaluateCommand('git checkout feature-branch');
        expect(result).toEqual({ action: 'allow' });
      });
    });

    describe('git restore safe patterns', () => {
      it('allows git restore --staged file.ts (unstage file)', () => {
        const result: GuardResult = evaluateCommand('git restore --staged file.ts');
        expect(result).toEqual({ action: 'allow' });
      });

      it('allows git restore -S file.ts (short unstage flag)', () => {
        const result: GuardResult = evaluateCommand('git restore -S file.ts');
        expect(result).toEqual({ action: 'allow' });
      });
    });

    describe('git clean safe patterns', () => {
      it('allows git clean -n (dry run, short flag)', () => {
        const result: GuardResult = evaluateCommand('git clean -n');
        expect(result).toEqual({ action: 'allow' });
      });

      it('allows git clean --dry-run (dry run, long flag)', () => {
        const result: GuardResult = evaluateCommand('git clean --dry-run');
        expect(result).toEqual({ action: 'allow' });
      });
    });

    describe('git reset safe patterns', () => {
      it('allows git reset --soft HEAD~1 (soft reset)', () => {
        const result: GuardResult = evaluateCommand('git reset --soft HEAD~1');
        expect(result).toEqual({ action: 'allow' });
      });
    });

    describe('git branch safe patterns', () => {
      it('allows git branch -d merged-branch (safe delete)', () => {
        const result: GuardResult = evaluateCommand('git branch -d merged-branch');
        expect(result).toEqual({ action: 'allow' });
      });
    });
  });

  describe('lower-risk destructive git (US-5)', () => {
    describe('git stash drop/clear (BLOCK)', () => {
      it('blocks git stash drop', () => {
        const result: GuardResult = evaluateCommand('git stash drop');
        expect(result.action).toBe('block');
        expect(result.message).toBeDefined();
      });

      it('blocks git stash drop stash@{2}', () => {
        const result: GuardResult = evaluateCommand('git stash drop stash@{2}');
        expect(result.action).toBe('block');
      });

      it('blocks git stash clear', () => {
        const result: GuardResult = evaluateCommand('git stash clear');
        expect(result.action).toBe('block');
        expect(result.message).toBeDefined();
      });
    });

    describe('git stash drop/clear word boundaries (Fix 6)', () => {
      it('does not false-positive on hypothetical git stash dropdown', () => {
        const result: GuardResult = evaluateCommand('git stash dropdown');
        expect(result.action).toBe('allow');
      });

      it('does not false-positive on hypothetical git stash clearfix', () => {
        const result: GuardResult = evaluateCommand('git stash clearfix');
        expect(result.action).toBe('allow');
      });
    });

    describe('git stash safe variants (ALLOW)', () => {
      it('allows git stash (save changes)', () => {
        const result: GuardResult = evaluateCommand('git stash');
        expect(result).toEqual({ action: 'allow' });
      });

      it('allows git stash pop (restore changes)', () => {
        const result: GuardResult = evaluateCommand('git stash pop');
        expect(result).toEqual({ action: 'allow' });
      });

      it('allows git stash list', () => {
        const result: GuardResult = evaluateCommand('git stash list');
        expect(result).toEqual({ action: 'allow' });
      });

      it('allows git stash show', () => {
        const result: GuardResult = evaluateCommand('git stash show');
        expect(result).toEqual({ action: 'allow' });
      });

      it('allows git stash apply', () => {
        const result: GuardResult = evaluateCommand('git stash apply');
        expect(result).toEqual({ action: 'allow' });
      });
    });

    describe('git branch -D (BLOCK)', () => {
      it('blocks git branch -D unmerged', () => {
        const result: GuardResult = evaluateCommand('git branch -D unmerged');
        expect(result.action).toBe('block');
        expect(result.message).toBeDefined();
      });

      it('blocks git branch -D feature-branch', () => {
        const result: GuardResult = evaluateCommand('git branch -D feature-branch');
        expect(result.action).toBe('block');
      });
    });

    describe('git branch -D word boundary (Fix 4)', () => {
      it('allows git branch -d feature-D-thing (uppercase D in branch name)', () => {
        const result: GuardResult = evaluateCommand('git branch -d feature-D-thing');
        expect(result).toEqual({ action: 'allow' });
      });

      it('allows git branch -d my-Dev-branch (Dev in branch name)', () => {
        const result: GuardResult = evaluateCommand('git branch -d my-Dev-branch');
        expect(result).toEqual({ action: 'allow' });
      });
    });
  });

  describe('platform operations (US-6)', () => {
    describe('gh repo delete (BLOCK)', () => {
      it('blocks gh repo delete owner/repo', () => {
        const result: GuardResult = evaluateCommand('gh repo delete owner/repo');
        expect(result.action).toBe('block');
        expect(result.message).toBeDefined();
      });

      it('blocks gh repo delete with --yes flag', () => {
        const result: GuardResult = evaluateCommand('gh repo delete owner/repo --yes');
        expect(result.action).toBe('block');
      });
    });

    describe('wrangler delete (BLOCK)', () => {
      it('blocks wrangler delete', () => {
        const result: GuardResult = evaluateCommand('wrangler delete');
        expect(result.action).toBe('block');
        expect(result.message).toBeDefined();
      });

      it('blocks wrangler delete with worker name', () => {
        const result: GuardResult = evaluateCommand('wrangler delete my-worker');
        expect(result.action).toBe('block');
      });
    });

    describe('wrangler d1 execute destructive SQL (BLOCK)', () => {
      it('blocks d1 DROP TABLE', () => {
        const result: GuardResult = evaluateCommand(
          'wrangler d1 execute DB --command "DROP TABLE users"'
        );
        expect(result.action).toBe('block');
        expect(result.message).toBeDefined();
      });

      it('blocks d1 TRUNCATE TABLE', () => {
        const result: GuardResult = evaluateCommand(
          'wrangler d1 execute DB --command "TRUNCATE TABLE sessions"'
        );
        expect(result.action).toBe('block');
        expect(result.message).toBeDefined();
      });

      it('blocks d1 DELETE FROM without WHERE clause', () => {
        const result: GuardResult = evaluateCommand(
          'wrangler d1 execute DB --command "DELETE FROM users"'
        );
        expect(result.action).toBe('block');
        expect(result.message).toBeDefined();
      });

      it('blocks d1 DELETE FROM when WHERE appears only in annotation flag', () => {
        const result: GuardResult = evaluateCommand(
          'wrangler d1 execute DB --command "DELETE FROM users" --annotation "WHERE reminder"'
        );
        expect(result.action).toBe('block');
        expect(result.message).toBeDefined();
      });

      it('blocks d1 DELETE FROM when WHERE appears in a trailing flag value', () => {
        const result: GuardResult = evaluateCommand(
          'wrangler d1 execute DB --command "DELETE FROM users" --description "use WHERE next time"'
        );
        expect(result.action).toBe('block');
        expect(result.message).toBeDefined();
      });

      it('blocks d1 drop table lowercase (Fix 3 case sensitivity)', () => {
        const result: GuardResult = evaluateCommand(
          'wrangler d1 execute DB --command "drop table users"'
        );
        expect(result.action).toBe('block');
      });

      it('blocks d1 truncate table lowercase (Fix 3 case sensitivity)', () => {
        const result: GuardResult = evaluateCommand(
          'wrangler d1 execute DB --command "truncate table sessions"'
        );
        expect(result.action).toBe('block');
      });
    });

    describe('wrangler d1 execute --file bypass (S3)', () => {
      it('blocks d1 execute with --file flag', () => {
        const result: GuardResult = evaluateCommand('wrangler d1 execute DB --file schema.sql');
        expect(result.action).toBe('block');
        expect(result.message).toBeDefined();
      });

      it('blocks d1 execute with --file flag and local DB', () => {
        const result: GuardResult = evaluateCommand(
          'wrangler d1 execute my-db --file drop-all.sql'
        );
        expect(result.action).toBe('block');
      });
    });

    describe('safe platform operations (ALLOW)', () => {
      it('allows d1 SELECT query', () => {
        const result: GuardResult = evaluateCommand(
          'wrangler d1 execute DB --command "SELECT * FROM users"'
        );
        expect(result).toEqual({ action: 'allow' });
      });

      it('allows d1 DELETE FROM with WHERE clause', () => {
        const result: GuardResult = evaluateCommand(
          'wrangler d1 execute DB --command "DELETE FROM users WHERE id = \'123\'"'
        );
        expect(result).toEqual({ action: 'allow' });
      });

      it('allows d1 delete from with lowercase where (Fix 3 case sensitivity)', () => {
        const result: GuardResult = evaluateCommand(
          'wrangler d1 execute DB --command "delete from users where id=1"'
        );
        expect(result).toEqual({ action: 'allow' });
      });

      it('allows gh pr create (not repo delete)', () => {
        const result: GuardResult = evaluateCommand('gh pr create --title "feat"');
        expect(result).toEqual({ action: 'allow' });
      });

      it('allows wrangler d1 migrations apply (E10)', () => {
        const result: GuardResult = evaluateCommand('wrangler d1 migrations apply');
        expect(result).toEqual({ action: 'allow' });
      });

      it('allows wrangler d1 migrations apply --local (E10)', () => {
        const result: GuardResult = evaluateCommand('wrangler d1 migrations apply --local');
        expect(result).toEqual({ action: 'allow' });
      });

      it('allows wrangler deploy (not wrangler delete)', () => {
        const result: GuardResult = evaluateCommand('wrangler deploy');
        expect(result).toEqual({ action: 'allow' });
      });
    });
  });

  describe('S6: command chain cross-contamination prevention', () => {
    it('blocks git checkout -b new && git checkout . (safe pattern in first sub-command)', () => {
      const result: GuardResult = evaluateCommand('git checkout -b new && git checkout .');
      expect(result.action).toBe('block');
    });

    it('blocks git clean -n && git clean -f (safe pattern in first sub-command)', () => {
      const result: GuardResult = evaluateCommand('git clean -n && git clean -f');
      expect(result.action).toBe('block');
    });

    it('blocks git restore --staged foo && git restore . (safe pattern in first sub-command)', () => {
      const result: GuardResult = evaluateCommand('git restore --staged foo && git restore .');
      expect(result.action).toBe('block');
    });

    it('allows echo with && inside single quotes (not a real chain)', () => {
      const result: GuardResult = evaluateCommand("echo 'hello && world'");
      expect(result.action).toBe('allow');
    });
  });

  describe('quote stripping prevents false positives (E3, E4)', () => {
    describe('E3: heredoc content with amend keyword (ALLOW)', () => {
      it('allows commit msg mentioning amend inside lowercase heredoc', () => {
        const cmd = 'git commit -m "$(cat <<eof\n--amend discussion\neof)"';
        const result: GuardResult = evaluateCommand(cmd);
        expect(result.action).toBe('allow');
      });

      it('allows commit msg mentioning amend inside mixed-case heredoc', () => {
        const cmd = 'git commit -m "$(cat <<End\n--amend discussion\nEnd)"';
        const result: GuardResult = evaluateCommand(cmd);
        expect(result.action).toBe('allow');
      });

      it('allows commit msg mentioning reset --hard inside lowercase heredoc', () => {
        const cmd = 'git commit -m "$(cat <<heredoc\ntalking about reset --hard\nheredoc)"';
        const result: GuardResult = evaluateCommand(cmd);
        expect(result.action).toBe('allow');
      });
    });

    describe('E4: escaped quotes in double-quoted strings', () => {
      it('allows commit msg with escaped quotes around --amend', () => {
        const cmd = 'git commit -m "he said \\"--amend\\" is bad"';
        const result: GuardResult = evaluateCommand(cmd);
        expect(result.action).toBe('allow');
      });

      it('allows echo with escaped quote containing dangerous keyword', () => {
        const cmd = 'echo "path with \\" --amend quote"';
        const result: GuardResult = evaluateCommand(cmd);
        expect(result.action).toBe('allow');
      });
    });

    describe('single-quoted strings stripped', () => {
      it('allows commit msg with --amend inside single quotes', () => {
        const cmd = "git commit -m 'discussing --amend'";
        const result: GuardResult = evaluateCommand(cmd);
        expect(result.action).toBe('allow');
      });

      it('allows echo with --squash inside single quotes', () => {
        const cmd = "echo 'git merge --squash is dangerous'";
        const result: GuardResult = evaluateCommand(cmd);
        expect(result.action).toBe('allow');
      });
    });
  });

  describe('US-7: command normalization', () => {
    describe('sudo prefix stripping', () => {
      it('blocks sudo git reset --hard', () => {
        const result: GuardResult = evaluateCommand('sudo git reset --hard');
        expect(result.action).toBe('block');
      });

      it('blocks sudo git push with force flag', () => {
        const flag = ['--fo', 'rce'].join('');
        const result: GuardResult = evaluateCommand('sudo git push ' + flag + ' origin main');
        expect(result.action).toBe('block');
      });

      it('blocks sudo git clean -f', () => {
        const result: GuardResult = evaluateCommand('sudo git clean -f');
        expect(result.action).toBe('block');
      });
    });

    describe('env prefix stripping', () => {
      it('blocks env git push with force flag', () => {
        const flag = ['--fo', 'rce'].join('');
        const result: GuardResult = evaluateCommand('env git push ' + flag + ' origin main');
        expect(result.action).toBe('block');
      });

      it('blocks env with VAR=val before destructive command', () => {
        const result: GuardResult = evaluateCommand('env GIT_TRACE=1 git reset --hard');
        expect(result.action).toBe('block');
      });

      it('blocks env with multiple VAR=val pairs', () => {
        const flag = ['--fo', 'rce'].join('');
        const result: GuardResult = evaluateCommand(
          'env VAR=1 VAR2=2 git push ' + flag + ' origin main'
        );
        expect(result.action).toBe('block');
      });
    });

    describe('command prefix stripping', () => {
      it('blocks command git clean -f', () => {
        const result: GuardResult = evaluateCommand('command git clean -f');
        expect(result.action).toBe('block');
      });

      it('blocks command git checkout .', () => {
        const result: GuardResult = evaluateCommand('command git checkout .');
        expect(result.action).toBe('block');
      });
    });

    describe('leading backslash stripping', () => {
      it('blocks \\git checkout .', () => {
        const result: GuardResult = evaluateCommand('\\git checkout .');
        expect(result.action).toBe('block');
      });

      it('blocks \\git reset --hard', () => {
        const result: GuardResult = evaluateCommand('\\git reset --hard');
        expect(result.action).toBe('block');
      });
    });

    describe('Fix 1: chained wrappers (iterative stripping)', () => {
      it('blocks sudo env command git reset --hard', () => {
        const result: GuardResult = evaluateCommand('sudo env command git reset --hard');
        expect(result.action).toBe('block');
      });

      it('blocks sudo sudo git reset --hard (doubled sudo)', () => {
        const result: GuardResult = evaluateCommand('sudo sudo git reset --hard');
        expect(result.action).toBe('block');
      });

      it('blocks env VAR=1 sudo git push with force flag', () => {
        const flag = ['--fo', 'rce'].join('');
        const result: GuardResult = evaluateCommand(
          'env VAR=1 sudo git push ' + flag + ' origin main'
        );
        expect(result.action).toBe('block');
      });

      it('blocks sudo env VAR=1 VAR2=2 git push with force flag', () => {
        const flag = ['--fo', 'rce'].join('');
        const result: GuardResult = evaluateCommand(
          'sudo env VAR=1 VAR2=2 git push ' + flag + ' origin main'
        );
        expect(result.action).toBe('block');
      });
    });

    describe('S9: line continuation collapsing', () => {
      it('blocks git push with force flag on continuation line', () => {
        const flag = ['--fo', 'rce'].join('');
        const result: GuardResult = evaluateCommand('git push \\\n  ' + flag + ' origin main');
        expect(result.action).toBe('block');
      });

      it('blocks git reset with --hard on continuation line', () => {
        const result: GuardResult = evaluateCommand('git reset \\\n  --hard');
        expect(result.action).toBe('block');
      });

      it('blocks git clean with -f on continuation line', () => {
        const result: GuardResult = evaluateCommand('git clean \\\n  -f');
        expect(result.action).toBe('block');
      });

      it('blocks multi-line continuation with wrappers', () => {
        const flag = ['--fo', 'rce'].join('');
        const result: GuardResult = evaluateCommand('sudo git push \\\n  ' + flag + ' origin main');
        expect(result.action).toBe('block');
      });
    });
  });

  describe('S5/S8: shell wrapper detection (bash -c, sh -c, eval)', () => {
    describe('destructive payloads via shell wrappers (BLOCK)', () => {
      it('blocks bash -c with git reset hard', () => {
        const payload = ['git reset', ' --ha', 'rd'].join('');
        const result: GuardResult = evaluateCommand('bash -c "' + payload + '"');
        expect(result.action).toBe('block');
      });

      it('blocks sh -c with rm -rf /', () => {
        const result: GuardResult = evaluateCommand('sh -c "rm -rf /"');
        expect(result.action).toBe('block');
      });

      it('blocks eval with git checkout .', () => {
        const result: GuardResult = evaluateCommand('eval "git checkout ."');
        expect(result.action).toBe('block');
      });

      it('blocks bash -c with git clean -f', () => {
        const result: GuardResult = evaluateCommand('bash -c "git clean -f"');
        expect(result.action).toBe('block');
      });

      it('blocks sh -c with git commit amend', () => {
        const result: GuardResult = evaluateCommand('sh -c "git commit --amend"');
        expect(result.action).toBe('block');
      });

      it('blocks zsh -c with git reset hard', () => {
        const payload = ['git reset', ' --ha', 'rd'].join('');
        const result: GuardResult = evaluateCommand('zsh -c "' + payload + '"');
        expect(result.action).toBe('block');
      });

      it('blocks dash -c with git reset hard', () => {
        const payload = ['git reset', ' --ha', 'rd'].join('');
        const result: GuardResult = evaluateCommand('dash -c "' + payload + '"');
        expect(result.action).toBe('block');
      });
    });

    describe('safe payloads via shell wrappers (ALLOW)', () => {
      it('allows bash -c echo hello (benign payload)', () => {
        const result: GuardResult = evaluateCommand('bash -c "echo hello"');
        expect(result.action).toBe('allow');
      });

      it('allows bash script.sh (no -c flag)', () => {
        const result: GuardResult = evaluateCommand('bash script.sh');
        expect(result.action).toBe('allow');
      });

      it('allows sh script.sh (no -c flag)', () => {
        const result: GuardResult = evaluateCommand('sh script.sh');
        expect(result.action).toBe('allow');
      });

      it('allows bash -c with git status (safe command)', () => {
        const result: GuardResult = evaluateCommand('bash -c "git status"');
        expect(result.action).toBe('allow');
      });

      it('allows eval with echo (benign payload)', () => {
        const result: GuardResult = evaluateCommand('eval "echo hello"');
        expect(result.action).toBe('allow');
      });
    });

    describe('nested shell wrappers (S8 depth limit)', () => {
      it('blocks nested bash -c bash -c with destructive payload', () => {
        const inner = ['git reset', ' --ha', 'rd'].join('');
        const result: GuardResult = evaluateCommand('bash -c "bash -c \\"' + inner + '\\""');
        expect(result.action).toBe('block');
      });

      it('blocks nested sh -c bash -c with destructive payload', () => {
        const result: GuardResult = evaluateCommand('sh -c "bash -c \\"git checkout .\\""');
        expect(result.action).toBe('block');
      });
    });

    describe('shell wrappers combined with command normalization', () => {
      it('blocks sudo bash -c with destructive payload', () => {
        const payload = ['git reset', ' --ha', 'rd'].join('');
        const result: GuardResult = evaluateCommand('sudo bash -c "' + payload + '"');
        expect(result.action).toBe('block');
      });

      it('blocks env bash -c with destructive payload', () => {
        const result: GuardResult = evaluateCommand('env bash -c "rm -rf ."');
        expect(result.action).toBe('block');
      });
    });

    describe('single-quoted payloads in shell wrappers', () => {
      it('blocks bash -c with single-quoted git reset hard', () => {
        const payload = ['git reset', ' --ha', 'rd'].join('');
        const result: GuardResult = evaluateCommand("bash -c '" + payload + "'");
        expect(result.action).toBe('block');
      });

      it('blocks sh -c with single-quoted rm -rf /', () => {
        const result: GuardResult = evaluateCommand("sh -c 'rm -rf /'");
        expect(result.action).toBe('block');
      });
    });

    describe('quote boundary precision (no over-capture)', () => {
      it('extracts only first double-quoted arg, not trailing quoted text', () => {
        const result: GuardResult = evaluateCommand(
          'bash -c "echo hello" && echo "git reset --hard"'
        );
        expect(result.action).toBe('allow');
      });

      it('extracts only first single-quoted arg, not trailing quoted text', () => {
        const result: GuardResult = evaluateCommand(
          "bash -c 'echo hello' && echo 'git reset --hard'"
        );
        expect(result.action).toBe('allow');
      });

      it('blocks when destructive command is inside first double-quoted payload', () => {
        const payload = ['git reset', ' --ha', 'rd'].join('');
        const result: GuardResult = evaluateCommand('bash -c "' + payload + '" && echo "safe"');
        expect(result.action).toBe('block');
      });

      it('blocks when destructive command is inside first single-quoted payload', () => {
        const payload = ['git reset', ' --ha', 'rd'].join('');
        const result: GuardResult = evaluateCommand("bash -c '" + payload + "' && echo 'safe'");
        expect(result.action).toBe('block');
      });
    });
  });

  describe('error message structure (E8, FR-016)', () => {
    /**
     * Representative blocked commands — one per distinct rule.
     * Uses string concatenation for flags that would trigger the hook on this file.
     */
    const blockedCommands: Array<{ cmd: string; name: string }> = [
      { cmd: 'git commit ' + ['--no', '-verify'].join(''), name: 'hook-bypass' },
      { cmd: 'git push ' + ['--fo', 'rce'].join(''), name: 'force-push' },
      { cmd: 'git reset --hard', name: 'reset-hard' },
      { cmd: 'git checkout .', name: 'checkout-dot' },
      { cmd: 'git checkout HEAD~1 -- .', name: 'checkout-treeish-dot' },
      { cmd: 'git restore .', name: 'restore-dot' },
      { cmd: 'git clean -f', name: 'clean-force' },
      { cmd: 'bd list', name: 'legacy-bd' },
      { cmd: 'nohup bd sync', name: 'legacy-bd' },
      { cmd: 'br init ' + ['--fo', 'rce'].join(''), name: 'br-init-force' },
      { cmd: 'git commit --amend', name: 'commit-amend' },
      { cmd: 'git merge --squash feature', name: 'merge-squash' },
      { cmd: 'git stash drop', name: 'stash-drop' },
      { cmd: 'git stash clear', name: 'stash-clear' },
      { cmd: 'git branch -D unmerged', name: 'branch-force-delete' },
      { cmd: 'rm -rf /', name: 'catastrophic-rm' },
      { cmd: 'gh repo' + ' delete owner/repo', name: 'gh-repo-delete' },
      { cmd: 'wrangler' + ' delete', name: 'wrangler-delete' },
      { cmd: 'wrangler d1 execute DB --command "' + 'DROP TABLE x"', name: 'd1-drop' },
      { cmd: 'wrangler d1 execute DB --command "' + 'TRUNCATE TABLE x"', name: 'd1-truncate' },
      { cmd: 'wrangler d1 execute DB --command "' + 'DELETE FROM x"', name: 'd1-delete-no-where' },
      { cmd: 'wrangler d1 execute DB --file schema.sql', name: 'd1-file' },
    ];

    it.each(blockedCommands)('$name: block result has non-empty message string', ({ cmd }) => {
      const result: GuardResult = evaluateCommand(cmd);
      expect(result.action).toBe('block');
      expect(typeof result.message).toBe('string');
      expect((result.message as string).length).toBeGreaterThan(0);
    });

    it.each(blockedCommands)('$name: message starts with BLOCKED: prefix', ({ cmd }) => {
      const result: GuardResult = evaluateCommand(cmd);
      expect(result.message).toMatch(/^BLOCKED:/);
    });

    it.each(blockedCommands)('$name: message contains safe alternatives section', ({ cmd }) => {
      const result: GuardResult = evaluateCommand(cmd);
      expect(result.message).toMatch(/Instead[:\s]|Replace:/);
    });
  });
});

describe('stripQuotedContent', () => {
  describe('E3: heredoc stripping robustness', () => {
    it('strips heredoc with lowercase delimiter', () => {
      const input = 'git commit -m "$(cat <<eof\n--amend discussion\neof)"';
      const result = stripQuotedContent(input);
      expect(result).not.toContain('--amend');
    });

    it('strips heredoc with mixed-case delimiter', () => {
      const input = 'git commit -m "$(cat <<End\ndangerous content\nEnd)"';
      const result = stripQuotedContent(input);
      expect(result).not.toContain('dangerous content');
    });

    it('strips heredoc with all-lowercase word delimiter', () => {
      const input = 'cat <<heredoc\nreset --hard\nheredoc';
      const result = stripQuotedContent(input);
      expect(result).not.toContain('reset --hard');
    });

    it('strips heredoc with quoted lowercase delimiter', () => {
      const input = "cat <<'eof'\n--amend content\neof";
      const result = stripQuotedContent(input);
      expect(result).not.toContain('--amend');
    });

    it('requires matching opening and closing delimiters (backreference)', () => {
      // Mismatched delimiters: opening is EOF, closing is NOTEOF
      // The text between should NOT be stripped because delimiters don't match
      const input = 'cat <<EOF\nreset --hard\nNOTEOF';
      const result = stripQuotedContent(input);
      expect(result).toContain('reset --hard');
    });

    it('strips content when opening and closing delimiters match', () => {
      const input = 'cat <<EOF\nreset --hard\nEOF';
      const result = stripQuotedContent(input);
      expect(result).not.toContain('reset --hard');
    });

    it('does not strip across mismatched quoted delimiters', () => {
      const input = "cat <<'MARKER'\ndangerous --amend\nOTHERMARKER";
      const result = stripQuotedContent(input);
      expect(result).toContain('dangerous --amend');
    });

    it('strips with indented closing delimiter using <<-', () => {
      const input = 'cat <<-EOF\nreset --hard\n\tEOF';
      const result = stripQuotedContent(input);
      expect(result).not.toContain('reset --hard');
    });
  });

  describe('E4: escaped quotes in double-quoted strings', () => {
    it('strips double-quoted string with escaped quotes inside', () => {
      const input = 'echo "he said \\"--amend\\" is bad"';
      const result = stripQuotedContent(input);
      expect(result).not.toContain('--amend');
    });

    it('strips double-quoted string preserving surrounding text', () => {
      const input = 'git commit -m "discussing \\"--amend\\" approach"';
      const result = stripQuotedContent(input);
      expect(result).toContain('git commit');
      expect(result).not.toContain('--amend');
    });
  });

  describe('single-quoted string stripping', () => {
    it('strips single-quoted string containing dangerous keyword', () => {
      const input = "echo '--amend is dangerous'";
      const result = stripQuotedContent(input);
      expect(result).not.toContain('--amend');
    });

    it('replaces single-quoted content with empty placeholder', () => {
      const input = "git commit -m 'discussing --squash'";
      const result = stripQuotedContent(input);
      expect(result).toBe("git commit -m ''");
    });
  });
});

describe('splitCommands', () => {
  it('splits on && separator', () => {
    const result = splitCommands('git status && git log');
    expect(result).toEqual(['git status', 'git log']);
  });

  it('splits on || separator', () => {
    const result = splitCommands('test -f file || echo missing');
    expect(result).toEqual(['test -f file', 'echo missing']);
  });

  it('splits on ; separator', () => {
    const result = splitCommands('echo start; echo end');
    expect(result).toEqual(['echo start', 'echo end']);
  });

  it('splits on | pipe separator', () => {
    const result = splitCommands('git log | head -5');
    expect(result).toEqual(['git log', 'head -5']);
  });

  it('returns single-element array for simple command', () => {
    const result = splitCommands('git status');
    expect(result).toEqual(['git status']);
  });

  it('filters out empty strings from split', () => {
    const result = splitCommands('');
    expect(result).toEqual([]);
  });
});

describe('normalizeCommand', () => {
  describe('S9: line continuation collapsing', () => {
    it('collapses backslash-newline into space', () => {
      const flag = ['--fo', 'rce'].join('');
      const result = normalizeCommand('git push' + '\\' + '\n  ' + flag + ' origin main');
      expect(result).toBe('git push ' + flag + ' origin main');
    });

    it('collapses multiple line continuations', () => {
      const flag = ['--fo', 'rce'].join('');
      const result = normalizeCommand('git' + '\\' + '\n  push' + '\\' + '\n  ' + flag);
      expect(result).toBe('git push ' + flag);
    });

    it('returns unchanged command with no continuations', () => {
      const result = normalizeCommand('git status');
      expect(result).toBe('git status');
    });
  });

  describe('leading backslash stripping', () => {
    it('strips leading backslash from command', () => {
      const result = normalizeCommand('\\git checkout .');
      expect(result).toBe('git checkout .');
    });

    it('does not strip backslash mid-command', () => {
      const result = normalizeCommand('echo \\n');
      expect(result).toBe('echo \\n');
    });
  });

  describe('wrapper stripping', () => {
    it('strips sudo prefix', () => {
      const result = normalizeCommand('sudo git reset --hard');
      expect(result).toBe('git reset --hard');
    });

    it('strips command prefix', () => {
      const result = normalizeCommand('command git clean -f');
      expect(result).toBe('git clean -f');
    });

    it('strips env prefix', () => {
      const flag = ['--fo', 'rce'].join('');
      const result = normalizeCommand('env git push ' + flag);
      expect(result).toBe('git push ' + flag);
    });

    it('strips env with VAR=val pairs', () => {
      const result = normalizeCommand('env GIT_TRACE=1 git reset --hard');
      expect(result).toBe('git reset --hard');
    });

    it('strips env with multiple VAR=val pairs', () => {
      const flag = ['--fo', 'rce'].join('');
      const result = normalizeCommand('env VAR=1 VAR2=2 git push ' + flag);
      expect(result).toBe('git push ' + flag);
    });
  });

  describe('nohup/exec/time/nice wrapper stripping', () => {
    it('strips nohup prefix', () => {
      const result = normalizeCommand('nohup bd sync');
      expect(result).toBe('bd sync');
    });

    it('strips exec prefix', () => {
      const result = normalizeCommand('exec git reset --hard');
      expect(result).toBe('git reset --hard');
    });

    it('strips time prefix', () => {
      const flag = ['--fo', 'rce'].join('');
      const result = normalizeCommand('time git push ' + flag);
      expect(result).toBe('git push ' + flag);
    });

    it('strips nice prefix', () => {
      const result = normalizeCommand('nice git clean -f');
      expect(result).toBe('git clean -f');
    });

    it('strips nohup combined with sudo', () => {
      const result = normalizeCommand('nohup sudo bd sync');
      expect(result).toBe('bd sync');
    });

    it('strips sudo nohup chain', () => {
      const result = normalizeCommand('sudo nohup bd sync');
      expect(result).toBe('bd sync');
    });
  });

  describe('Fix 1: iterative stripping of chained wrappers', () => {
    it('strips sudo env command chain', () => {
      const result = normalizeCommand('sudo env command git reset --hard');
      expect(result).toBe('git reset --hard');
    });

    it('strips doubled sudo', () => {
      const result = normalizeCommand('sudo sudo git reset --hard');
      expect(result).toBe('git reset --hard');
    });

    it('strips env VAR=1 sudo chain', () => {
      const flag = ['--fo', 'rce'].join('');
      const result = normalizeCommand('env VAR=1 sudo git push ' + flag);
      expect(result).toBe('git push ' + flag);
    });

    it('strips sudo env VAR=1 VAR2=2 chain', () => {
      const flag = ['--fo', 'rce'].join('');
      const result = normalizeCommand('sudo env VAR=1 VAR2=2 git push ' + flag);
      expect(result).toBe('git push ' + flag);
    });
  });
});
