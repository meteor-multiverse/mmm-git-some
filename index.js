var fs = require('fs');
var path = require('path');

var _ = require('lodash');
var parseGitUrl = require('github-url-from-git');
var execSync = require('sync-exec');
var rimrafSync = require('rimraf').sync;
var globSync = require('glob').sync;


module.exports = {

  /**
   * dir = localGitRepoDir;
   */
  isLocalRepo: function(opts, callback) {
    if (typeof callback === 'undefined' && typeof opts === 'function') {
      callback = opts;
      opts = undefined;
    }
    if (typeof opts === 'undefined') {
      opts = { cwd: process.cwd() };
    }

    var async = typeof callback === 'function';
    var dir = opts ? (opts.cwd || opts) : null;
    var err = null;

    if (!opts) {
      err = new Error('You did not provide `opts`');
    }
    else if (!dir) {
      err = new Error('You did not provide argument `opts.cwd`');
    }

    var gitDir = dir ? path.join(dir, '.git') : null;
    if (async) {
      if (err) {
        setImmediate(function() {
          callback(err, null);
        });
      }
      else {
        fs.stat(gitDir, function(err, result) {
          callback(err, !!result && result.isDirectory());
        });
      }
    }
    else {
      if (err) {
        //console.warn('[git-some] error: ' + err);
        throw err;
      }
      var result;
      try {
        result = fs.statSync(gitDir);
      }
      catch (e) {}
      //console.warn('[git-some] result: ' + JSON.stringify(result) + '\nisFile? ' + result.isFile() + '\nisDirectory? ' + result.isDirectory());
      return !!result && result.isDirectory();
    }
  },


  /**
   * opts = { cwd: localGitRepoDir };
   */
  isRepoUpToDate: function(opts, callback) {
    if (typeof callback === 'undefined' && typeof opts === 'function') {
      callback = opts;
      opts = { cwd: process.cwd() };
    }
    var async = typeof callback === 'function';
    var dir = opts ? (opts.cwd || (typeof opts === 'string' && opts)) : null;
    var err = null;

    if (!opts) {
      err = new Error('You did not provide `opts`');
    }
    else if (!dir) {
      err = new Error('You did not provide `opts.cwd`');
    }

    if (!err && !this.isLocalRepo(dir)) {
      err = new Error('Not a valid git repo: ' + dir);
    }

    var result = err ? null : execSync('git fetch; git status | grep -i -c "is up-to-date"', { cwd: dir });
    var isUpToDate = !!result && result.status === 0 && _.trim(result.stdout) === '1';

    if (async) {
      setImmediate(function() {
        callback(err, isUpToDate);
      });
    }
    else {
      if (err) {
        throw err;
      }
      return isUpToDate;
    }
  },


  /**
   * opts = { branch: branchName, url: gitRemoteUrl };
   * opts = { branch: branchName, cwd: localGitRepoDir };
   */
  doesRemoteBranchExist: function(opts, callback) {
    if (typeof opts === 'string') {
      opts = {
        url: null,
        branch: opts,
        cwd: process.cwd()
      };
    }
    var async = typeof callback === 'function';
    var err = null;

    if (!opts) {
      err = new Error('You did not provide `opts`');
    }
    else if (!opts.url && !opts.cwd) {
      err = new Error('Must provide either `opts.url` or `opts.cwd`');
    }

    if (!err && !opts.url && !this.isLocalRepo(opts.cwd)) {
      err = new Error('Not a valid git repo: ' + opts.cwd);
    }

    var remoteBranchExists = err ? null : false;
    if (!err) {
      var result;
      if (opts.url) {
        result = execSync('git ls-remote --heads ' + opts.url + ' | grep -swc "refs/heads/' + opts.branch + '$"');
      }
      else if (opts.cwd) {
        result = execSync('git fetch; git ls-remote --heads | grep -swc "refs/heads/' + opts.branch + '$"', { cwd: opts.cwd });
      }
      remoteBranchExists = !!result && result.status === 0 && _.trim(result.stdout) === '1';
    }

    if (async) {
      setImmediate(function() {
        callback(err, remoteBranchExists);
      });
    }
    else {
      if (err) {
        throw err;
      }
      return remoteBranchExists;
    }
  },


  /**
  * opts = { url: gitRemoteUrl, branch: branchName, cwd: parentDir, deleteExistingDir: false };
  */
  cloneFromOrCreateEmptyBranch: function(opts, callback) {
    var err = null,
        clonedDirPath = null;
    if (!opts) {
      err = new Error('You did not provide `opts`');
    }
    else if (!opts.url) {
      err = new Error('You did not provide `opts.url`');
    }
    else if (!opts.branch) {
      err = new Error('You did not provide `opts.branch`');
    }
    else if (!opts.cwd) {
      opts.cwd = process.cwd();
      err = opts.cwd ? null : new Error('You did not provide `opts.cwd`');
    }
    opts.deleteExistingDir = opts.deleteExistingDir === true;

    var async = typeof callback === 'function';

    if (err) {
      if (!async) {
        throw err;
      }
      setImmediate(function() {
        callback(err, clonedDirPath);
      });
      return;
    }

    var repoName = parseGitUrl(opts.url).split('/').slice(-1)[0];
    clonedDirPath = path.join(opts.cwd, repoName);

    if (fs.existsSync(clonedDirPath)) {
      if (opts.deleteExistingDir) {
        rimrafSync(clonedDirPath);
      }
      else {
        err = new Error('Destination directory already exists: ' + clonedDirPath);
      }
    }

    if (!err) {
      var result = null;
      var remoteBranchExists = this.doesRemoteBranchExist(opts);
      if (remoteBranchExists) {
        result = execSync('git clone ' + opts.url + ' --branch ' + opts.branch + ' --single-branch --depth 1', { cwd: opts.cwd });
      }
      else {
        result = execSync('git clone ' + opts.url + ' --depth 1', { cwd: opts.cwd });
        if (result.status === 0) {
          result = execSync('git checkout --orphan ' + opts.branch + ' && git rm --cached -f -r .', { cwd: clonedDirPath });
          if (result.status === 0) {
            var dotfiles = globSync('.*', { cwd: clonedDirPath, mark: true, ignore: '.git/' });
            execSync('rm -rf * ' + dotfiles.join(' '), { cwd: clonedDirPath });
          }
        }
      }

      if (result.status !== 0) {
        clonedDirPath = null;
        err = new Error('Failed to clone repo ' + JSON.stringify(opts.url) + ' from single branch ' + JSON.stringify(opts.branch) + '\n' + (result.stderr || result.stdout));
      }
    }

    if (async) {
      setImmediate(function() {
        callback(err, clonedDirPath);
      });
    }
    else {
      if (err) {
        throw err;
      }
      return clonedDirPath;
    }
  },


  /**
   * opts = { cwd: localGitRepoDir };
   */
  getCurrentBranch: function(opts, callback) {
    if (typeof opts === 'string') {
      opts = { cwd: opts };
    }
    else if (typeof opts === 'function' && typeof callback === 'undefined') {
      callback = opts;
      opts = null;
    }

    if (!opts) {
      opts = {};
    }
    if (!opts.cwd) {
      opts.cwd = process.cwd();
    }

    var async = typeof callback === 'function';
    var err = opts.cwd ? null : new Error('You did not provide `opts.cwd`');

    if (!err && !this.isLocalRepo(opts.cwd)) {
      err = new Error('Not a valid git repo: ' + opts.cwd);
    }

    var branchName = null;
    if (!err) {
      var result = execSync('git rev-parse --abbrev-ref HEAD', { cwd: opts.cwd });
      branchName = (!!result && result.status === 0 && _.trim(result.stdout)) || null;
    }

    if (async) {
      setImmediate(function() {
        callback(err, branchName);
      });
    }
    else {
      if (err) {
        throw err;
      }
      return branchName;
    }
  },


  /**
   * opts = { branch: null, cwd: localGitRepoDir };
   */
  getCurrentSha: function(opts, callback) {
    if (typeof opts === 'string') {
      opts = { cwd: opts };
    }
    else if (typeof opts === 'function' && typeof callback === 'undefined') {
      callback = opts;
      opts = null;
    }

    if (!opts) {
      opts = {};
    }
    if (!opts.cwd) {
      opts.cwd = process.cwd();
    }

    var async = typeof callback === 'function';
    var err = opts.cwd ? null : new Error('You did not provide `opts.cwd`');

    if (!err && !this.isLocalRepo(opts.cwd)) {
      err = new Error('Not a valid git repo: ' + opts.cwd);
    }

    var commitSha = null;
    var refName = opts.branch || 'HEAD';
    if (!err) {
      var result = execSync('git rev-parse ' + refName, { cwd: opts.cwd });
      commitSha = (!!result && result.status === 0 && _.trim(result.stdout)) || null;
    }

    if (async) {
      setImmediate(function() {
        callback(err, commitSha);
      });
    }
    else {
      if (err) {
        throw err;
      }
      return commitSha;
    }
  },


  /**
   * opts = { cwd: localGitRepoDir };
   */
  hasUncommitedFiles: function(opts, callback) {
    if (typeof opts === 'string') {
      opts = { cwd: opts };
    }
    else if (typeof opts === 'function' && typeof callback === 'undefined') {
      callback = opts;
      opts = null;
    }

    if (!opts) {
      opts = {};
    }
    if (!opts.cwd) {
      opts.cwd = process.cwd();
    }

    var async = typeof callback === 'function';
    var err = opts.cwd ? null : new Error('You did not provide `opts.cwd`');

    if (!err && !this.isLocalRepo(opts.cwd)) {
      err = new Error('Not a valid git repo: ' + opts.cwd);
    }

    var uncommitted = null;
    if (!err) {
      var result = execSync('git status | grep -swc "nothing to commit, working directory clean"', { cwd: opts.cwd });
      uncommitted = !(result && result.status === 0 && _.trim(result.stdout) === '1');
    }

    if (async) {
      setImmediate(function() {
        callback(err, uncommitted);
      });
    }
    else {
      if (err) {
        throw err;
      }
      return uncommitted;
    }
  },


  /**
   * opts = { cwd: localGitRepoDir };
   */
  getUserIdentity: function(opts, callback) {
    if (typeof callback === 'undefined' && typeof opts === 'function') {
      callback = opts;
      opts = {};
    }

    if (!opts) {
      opts = {};
    }
    if (!opts.cwd) {
      opts.cwd = process.cwd();
    }

    var async = typeof callback === 'function';
    var err = null;
    var author = {};

    var result = execSync('git config user.name', { cwd: opts.cwd });
    if (result.status === 0) {
      author.name = _.trim(result.stdout);
    }
    else {
      err = new Error('Failed to get author name!\n' + (result.stderr || result.stdout));
    }

    result = execSync('git config user.email', { cwd: opts.cwd });
    if (result.status === 0) {
      author.email = _.trim(result.stdout);
    }
    else {
      err = new Error((err ? err.message + '\n\n' : '') + 'Failed to get author email!\n' + (result.stderr || result.stdout));
    }

    // If we found at least one identifier, discard any errors
    if (author.name || author.email) {
      err = null;
    }

    if (err) {
      author = null;
    }

    if (async) {
      setImmediate(function() {
        callback(err, author);
      });
    }
    else {
      if (err) {
        throw err;
      }
      return author;
    }
  },


  /**
   * opts = { cwd: localGitRepoDir };
   */
  addAllToIndex: function(opts, callback) {
    if (typeof callback === 'undefined' && typeof opts === 'function') {
      callback = opts;
      opts = {};
    }

    if (!opts) {
      opts = {};
    }
    if (!opts.cwd) {
      opts.cwd = process.cwd();
    }

    var async = typeof callback === 'function';
    var err = opts.cwd ? null : new Error('You did not provide `opts.cwd`');

    if (!err && !this.isLocalRepo(opts.cwd)) {
      err = new Error('Not a valid git repo: ' + opts.cwd);
    }

    if (!err) {
      var result = execSync('git add -A', { cwd: opts.cwd });
      if (!result || result.status !== 0) {
        err = new Error('An error occurred while adding files to the git index!\n' + (result.stderr || result.stdout));
      }
    }

    if (async) {
      setImmediate(function() {
        callback(err, null);
      });
    }
    else {
      if (err) {
        throw err;
      }
      return null;
    }
  },


  /**
   * opts = { message: 'Commit message', cwd: localGitRepoDir }
   */
  commit: function(opts, callback) {
    if (typeof opts === 'string') {
      opts = { message: opts };
    }
    else if (typeof opts === 'function' && typeof callback === 'undefined') {
      callback = opts;
      opts = null;
    }

    if (!opts) {
      opts = {};
    }
    if (!opts.cwd) {
      opts.cwd = process.cwd();
    }

    var async = typeof callback === 'function';
    var err = opts.cwd ? null : new Error('You did not provide `opts.cwd`');

    if (!err && !this.isLocalRepo(opts.cwd)) {
      err = new Error('Not a valid git repo: ' + opts.cwd);
    }

    if (!err) {
      var result = execSync('git commit' + (opts.message ? ' -m ' + opts.message : ''), { cwd: opts.cwd });
      if (result.status !== 0) {
        err = new Error('Failed to commit!\n' + (result.stderr || result.stdout));
      }
    }

    var commitSha = null;
    if (!err) {
      commitSha = this.getCurrentSha({ cwd: opts.cwd });
    }

    if (async) {
      setImmediate(function() {
        callback(err, commitSha);
      });
    }
    else {
      if (err) {
        throw err;
      }
      return commitSha;
    }
  },


  /**
   * opts = { tag: tagName, message: 'Tag annotation', cwd: localGitRepoDir };
   */
  createTag: function(opts, callback) {
    if (typeof opts === 'string') {
      opts = { tag: opts };
    }
    else if (typeof opts === 'function' && typeof callback === 'undefined') {
      callback = opts;
      opts = null;
    }

    if (!opts) {
      opts = {};
    }
    if (!opts.cwd) {
      opts.cwd = process.cwd();
    }
    if (!opts.message) {
      opts.message = null;
    }

    var async = typeof callback === 'function';
    var err = opts.cwd ? null : new Error('You did not provide `opts.cwd`');

    if (!err && !this.isLocalRepo(opts.cwd)) {
      err = new Error('Not a valid git repo: ' + opts.cwd);
    }

    if (!err && !opts.tag) {
      err = new Error('You did not provide `opts.tag`');
    }

    if (!err) {
      var result = execSync('git tag ' + opts.tag + (opts.message ? ' -a -m ' + opts.message : ''), { cwd: opts.cwd });
      if (result.status !== 0) {
        err = new Error('Failed to tag!\n' + (result.stderr || result.stdout));
      }
    }

    var commitSha = null;
    if (!err) {
      commitSha = this.getCurrentSha({ cwd: opts.cwd });
    }

    if (async) {
      setImmediate(function() {
        callback(err, commitSha);
      });
    }
    else {
      if (err) {
        throw err;
      }
      return commitSha;
    }
  },


  /**
   * opts = { branch: null, includeTags: false, enableTracking: true, cwd: localGitRepoDir, remote: null };
   */
  pushBranch: function(opts, callback) {
    if (typeof opts === 'string') {
      opts = { branch: opts };
    }
    if (typeof callback === 'undefined' && typeof opts === 'function') {
      callback = opts;
      opts = null;
    }

    if (!opts) {
      opts = {};
    }
    if (!opts.cwd) {
      opts.cwd = process.cwd();
    }
    if (!opts.remote) {
      opts.remote = 'origin';
    }
    opts.includeTags = opts.includeTags === true;
    opts.enableTracking = opts.enableTracking !== false;

    var async = typeof callback === 'function';
    var err = opts.cwd ? null : new Error('You did not provide `opts.cwd`');

    if (!err && !this.isLocalRepo(opts.cwd)) {
      err = new Error('Not a valid git repo: ' + opts.cwd);
    }

    if (!err) {
      var branchName = opts.branch || this.getCurrentBranch({ cwd: opts.cwd });
      var result = execSync('git push ' + (opts.enableTracking ? '-u ' : '') + opts.remote + ' ' + branchName + (opts.includeTags ? ' --tags' : ''), { cwd: opts.cwd });
      if (result.status !== 0) {
        err = new Error('Failed to push branch: ' + branchName + '\n' + (result.stderr || result.stdout));
      }
    }

    if (async) {
      setImmediate(function() {
        callback(err, null);
      });
    }
    else {
      if (err) {
        throw err;
      }
      return null;
    }
  },


  /**
   * opts = { tags: [], cwd: localGitRepoDir, remote: null };
   */
  pushTags: function(opts, callback) {
    if (typeof opts === 'string') {
      opts = { cwd: opts };
    }
    if (typeof callback === 'undefined' && typeof opts === 'function') {
      callback = opts;
      opts = null;
    }

    if (!opts) {
      opts = {};
    }
    if (!opts.cwd) {
      opts.cwd = process.cwd();
    }
    if (!opts.remote) {
      opts.remote = 'origin';
    }
    if (!opts.tags) {
      opts.tags = [];
    }
    if (opts.tags.length > 1 && _.contains(opts.tags, '--tags')) {
      opts.tags.length = 0;
    }
    if (opts.tags.length === 0) {
      opts.tags.push('--tags');
    }

    var async = typeof callback === 'function';
    var err = opts.cwd ? null : new Error('You did not provide `opts.cwd`');

    if (!err && !this.isLocalRepo(opts.cwd)) {
      err = new Error('Not a valid git repo: ' + opts.cwd);
    }

    if (!err) {
      var tagsStr = opts.tags.length === 1 && opts.tags[0] === '--tags' ? '--tags' : 'tag ' + opts.tags.join(' tag ');
      var result = execSync('git push ' + opts.remote + ' ' + tagsStr, { cwd: opts.cwd });
      if (result.status !== 0) {
        err = new Error('Failed to push tags!\n' + (result.stderr || result.stdout));
      }
    }

    if (async) {
      setImmediate(function() {
        callback(err, null);
      });
    }
    else {
      if (err) {
        throw err;
      }
      return null;
    }
  }

};
