#!/bin/bash
# start-prometheus.sh - Script to start Prometheus Docker container for local development

# Create Prometheus config if it doesn't exist
if [ ! -f "prometheus.local.yml" ]; then
  echo "Creating prometheus.local.yml..."
  cat > prometheus.local.yml << 'EOL'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'polkadot-rpc-monitor'
    scrape_interval: 10s
    static_configs:
      - targets: ['host.docker.internal:3000']
    metrics_path: '/metrics'
EOL
fi

# Start Prometheus container
echo "Starting Prometheus container..."
docker run -d \
  --name prometheus-local \
  -p 9090:9090 \
  -v "$(pwd)/prometheus.local.yml:/etc/prometheus/prometheus.yml" \
  --add-host=host.docker.internal:host-gateway \
  prom/prometheus:latest

echo "Prometheus is running at http://localhost:9090"
echo "It will scrape metrics from your local app at http://localhost:3000/metrics"
echo ""
echo "To stop Prometheus: docker stop prometheus-local && docker rm prometheus-local"
