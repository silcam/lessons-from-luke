namespace :custom do
  desc "Restart Passenger"
  task :restart_passenger do
    on roles(:app) do
      execute "passenger-config", "restart-app #{deploy_to}"
    end
  end
end