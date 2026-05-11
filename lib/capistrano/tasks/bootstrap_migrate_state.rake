namespace :custom do
  desc "One-time bootstrap of .migrate-prod from legacy .migrate in shared/"
  task :bootstrap_migrate_state do
    on roles(:app) do
      within shared_path do
        execute :sh, "-c", %Q{'test -f .migrate-prod || { test -f .migrate && cp .migrate .migrate-prod; } || true'}
      end
    end
  end
end

before "deploy:check:linked_files", "custom:bootstrap_migrate_state"
