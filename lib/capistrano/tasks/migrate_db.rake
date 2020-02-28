namespace :custom do
  desc 'Migrate Database'
  task :migrate_db do
    on roles(:app) do
      within "#{release_path}" do
        execute :yarn, "migrate"
      end
    end
  end
end