# GESPRO_G1_E2
Luis Ubaldo Balderas Sánchez

Valeria Alessandra Fernández Huerta

Sofia Carranza López

Frida Castillo Carrillo

Carlos Rojas Valenzuela






## Descripción del Repositorio

### ¿Qué se desarrolló?
Se ha desarrollado una aplicación web de tipo **Gestor de Tareas Kanban**. El objetivo es permitir a un equipo organizar su trabajo visualmente moviendo tareas entre estados ("TODO", "IN_PROGRESS", "DONE").

El sistema utiliza una arquitectura Cliente-Servidor:
* **Backend:** Desarrollado en **Python** con **Flask**. Provee una API REST para gestionar usuarios y tareas.
* **Frontend:** Interfaz web construida con **HTML, CSS y JavaScript Vanilla**, que consume la API del servidor.
* **Persistencia:** Los datos no son volátiles; se guardan en el servidor utilizando archivos JSON (`users.json` y `tasks.json`).

### Requerimientos de instalación
Para ejecutar este proyecto es necesario disponer de **Python 3** instalado en el sistema. Además, el servidor depende de las siguientes librerías externas que deben instalarse:

1.  **Flask**: El microframework web.
2.  **Flask-CORS**: Para permitir las peticiones entre el frontend y el backend (Cross-Origin Resource Sharing).

Puedes instalar las dependencias ejecutando el siguiente comando en tu terminal:

bash
pip install flask flask-cors
