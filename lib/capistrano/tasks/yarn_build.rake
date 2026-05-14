namespace :custom do
  desc 'Yarn Build Server App'
  task :yarn_build do
    on roles(:app) do
      within "#{release_path}" do
        execute :yarn, "install --immutable"
        execute :yarn, "build-server"
      end
    end
  end
end
