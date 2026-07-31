#!/bin/bash
# Script para verificar el estado real de una orden en el backend
# Uso: ./verify_order.sh ORDER_ID

if [ -z "$1" ]; then
  echo "Uso: ./verify_order.sh ORDER_ID"
  exit 1
fi

echo "🔍 Verificando orden $1 en el backend..."
echo ""

# Aquí necesitarás tu token de acceso
# Por ahora solo mostramos el comando que debes ejecutar
echo "Ejecuta este comando en tu terminal con tu token de acceso:"
echo ""
echo "curl -H 'Authorization: Bearer YOUR_TOKEN' \\"
echo "  'http://localhost:YOUR_PORT/api/orders/$1' | jq '.docState'"

