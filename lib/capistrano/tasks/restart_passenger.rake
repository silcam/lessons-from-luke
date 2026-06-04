namespace :custom do
  desc "Restart Passenger"
  task :restart_passenger do
    on roles(:app) do
      execute "passenger-config", "restart-app #{current_path} --ignore-app-not-running"
    end
  end
end
