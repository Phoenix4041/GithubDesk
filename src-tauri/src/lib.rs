pub mod commands;
pub mod error;
pub mod git;
pub mod github;
pub mod jobs;
pub mod pty;
pub mod state;
pub mod watcher;

use commands::{
    blame, branch, commit, commit_ops, compare, conflict, github_account, github_actions,
    github_issues, github_pulls, github_repo, history, job, operation, rebase, reflog, remote,
    repo, stash, status, tag, terminal, watch,
};
use state::AppState;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            app.manage(AppState::new(directory));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            repo::repo_open,
            repo::repo_init,
            repo::repo_clone,
            status::status_get,
            status::diff_file,
            status::changes_stage,
            status::changes_unstage,
            status::changes_discard,
            status::changes_stage_selection,
            status::changes_unstage_selection,
            commit::commit_head,
            commit::commit_create,
            commit::commit_undo,
            branch::branch_list,
            branch::branch_create,
            branch::branch_switch,
            branch::branch_rename,
            branch::branch_delete,
            branch::branch_publish,
            remote::remote_list,
            remote::remote_fetch,
            remote::remote_pull,
            remote::remote_push,
            operation::operation_state,
            operation::operation_run,
            history::history_list,
            history::history_prepare_graph,
            history::history_detail,
            history::history_files,
            history::history_file_diff,
            commit_ops::commit_cherry_pick,
            commit_ops::commit_revert,
            commit_ops::commit_reset,
            commit_ops::commit_checkout,
            stash::stash_list,
            stash::stash_save,
            stash::stash_apply,
            stash::stash_drop,
            stash::stash_branch,
            stash::stash_changed_files,
            stash::stash_diff,
            compare::compare_get_summary,
            compare::compare_changed_files,
            compare::compare_diff,
            conflict::conflict_get,
            conflict::conflict_resolve,
            conflict::conflict_choose_side,
            rebase::rebase_plan,
            rebase::rebase_start,
            blame::blame_get,
            reflog::reflog_list,
            reflog::reflog_undo_plan,
            reflog::reflog_restore,
            reflog::reflog_undo,
            github_account::github_accounts_list,
            github_account::github_account_add_token,
            github_account::github_account_remove,
            github_account::github_device_start,
            github_account::github_device_finish,
            github_repo::github_repo_remotes,
            github_pulls::github_repo_info,
            github_pulls::github_pulls_list,
            github_pulls::github_pull_get,
            github_pulls::github_pull_files,
            github_pulls::github_pull_create,
            github_pulls::github_pull_comment,
            github_pulls::github_pull_merge,
            github_pulls::github_pull_set_state,
            github_pulls::github_pull_review,
            github_pulls::github_pull_checkout,
            github_issues::github_issues_list,
            github_issues::github_issue_get,
            github_issues::github_issue_create,
            github_issues::github_issue_comment,
            github_issues::github_issue_set_state,
            github_issues::github_labels_list,
            github_issues::github_assignees_list,
            github_actions::github_runs_list,
            github_actions::github_run_get,
            github_actions::github_run_jobs,
            github_actions::github_job_log,
            github_actions::github_run_rerun,
            github_actions::github_run_cancel,
            github_actions::github_workflows_list,
            github_actions::github_workflow_dispatch,
            github_repo::github_set_git_account,
            tag::tag_list,
            tag::tag_create,
            tag::tag_delete,
            tag::tag_push,
            tag::tag_delete_remote,
            terminal::terminal_shells,
            terminal::terminal_open,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_close,
            job::job_cancel,
            watch::watch_start,
            watch::watch_stop,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run application");
}
