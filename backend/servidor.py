from flask import Flask, jsonify
from flask_cors import CORS  # 1. Importar CORS

app = Flask(__name__)
CORS(app)  # 2. Habilitar CORS para todas las rutas

@app.route("/")
def home():
    return "¡Servidor Flask funcionando! 🚀"

@app.route("/api/info", methods=["GET"])
def get_info():
    data = {
        "service": "Flask API",
        "version": "1.0.0",
        "python_version": "3.13",
        "author": "Valeria, Sofia, Frida, Carlos y Luis"
    }
    return jsonify(data)

# 3. Agregar la ruta que faltaba para el botón de detalles
@app.route("/api/detalles", methods=["GET"])
def get_detalles():
    return jsonify({
        "status": "success",
        "detalles": "Esta es información extra desde el servidor."
    })

if __name__ == "__main__":
    app.run(debug=True)