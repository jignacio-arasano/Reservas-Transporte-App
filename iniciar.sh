#!/bin/bash
echo ""
echo "  ============================================="
echo "   COLECTIVO RESERVAS — Iniciando servidor..."
echo "  ============================================="
echo ""

# Cargar .env si existe
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs) 2>/dev/null
    echo "  [OK] Archivo .env cargado"
else
    echo "  [!] No encontré el archivo .env"
    cp .env.example .env
    echo "  [!] Copiado .env.example → .env"
    echo "      Editá .env con tu Access Token de MercadoPago"
    echo "      El servidor arrancará en modo DEMO"
    echo ""
fi

# Instalar dependencias si hace falta
if [ ! -d "node_modules" ]; then
    echo "  [!] Instalando dependencias (solo la primera vez)..."
    npm install
    echo ""
fi

echo "  Servidor en: http://localhost:3000"
echo ""

# Abrir navegador
if [[ "$OSTYPE" == "darwin"* ]]; then
    sleep 1.5 && open http://localhost:3000 &
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    sleep 1.5 && xdg-open http://localhost:3000 &
fi

node server.js
