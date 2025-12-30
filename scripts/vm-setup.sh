#!/bin/bash
# ============================================
# bibbly Backend - VM Setup Script
# Run this on your Virtual Machine
# ============================================

set -e

echo "🚀 Setting up bibbly Backend on VM..."

# Update system
echo "📦 Updating system packages..."
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker
echo "🐳 Installing Docker..."
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
echo "📝 Installing Docker Compose..."
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Create app directory
echo "📁 Creating app directory..."
sudo mkdir -p /opt/bibbly
sudo chown $USER:$USER /opt/bibbly

# Install useful tools
echo "🔧 Installing utilities..."
sudo apt-get install -y git curl wget htop

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Log out and log back in (for Docker group permissions)"
echo "2. Clone your repo: git clone YOUR_REPO /opt/bibbly"
echo "3. cd /opt/bibbly/backend"
echo "4. Copy .env.example to .env and configure"
echo "5. Run: docker-compose up -d"
echo ""
echo "Your public IP: $(curl -s ifconfig.me)"

