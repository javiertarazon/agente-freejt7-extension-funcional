---
name: zorin-gui-software-install
description: 'Guia para instalar programas en Zorin OS y Linux derivados de Ubuntu usando pocos clics, interfaz grafica y sin escribir comandos ni usar la terminal. Use when el usuario pida instalar programas en Zorin, Linux sin terminal, con pocos clics, desde la tienda de software, con archivos .deb, AppImage o Flatpak, o cuando quiera una experiencia no tecnica para instalar aplicaciones.'
---

# Zorin GUI Software Install

Usa esta skill cuando el objetivo sea instalar aplicaciones en Zorin OS sin comandos, priorizando siempre rutas GUI, pocos clics y lenguaje no tecnico.

## Cuando usarla

- El usuario pide instalar un programa en Zorin OS o Linux sin terminal.
- El usuario dice "con pocos clics", "sin codigo", "sin escribir comandos" o "por interfaz grafica".
- El usuario tiene un archivo .deb, .flatpakref o AppImage y quiere abrirlo desde el explorador.
- El usuario necesita una guia apta para personas no tecnicas.

## Reglas operativas

- Prioriza siempre la Tienda de software o instaladores graficos antes que cualquier alternativa tecnica.
- No propongas terminal salvo que el usuario la pida de forma explicita.
- Explica cada flujo en pasos cortos, numerados y accionables.
- Si el programa existe en la tienda de software, usa ese camino como opcion 1.
- Si el usuario ya tiene un archivo descargado, adapta la guia al formato real del archivo.

## Flujo recomendado

### 1. Instalacion desde la tienda de software

Usa este camino cuando el programa sea comun o conocido.

1. Abre la aplicacion Software o Tienda de software de Zorin.
2. Escribe el nombre del programa en la barra de busqueda.
3. Entra en el resultado correcto.
4. Pulsa Instalar.
5. Introduce tu contrasena si el sistema la pide.
6. Cuando termine, pulsa Abrir o busca el programa en el menu.

### 2. Instalacion de un archivo .deb sin terminal

Usa este camino cuando el usuario ya descargo un instalador .deb.

1. Abre la carpeta Descargas.
2. Haz doble clic sobre el archivo .deb.
3. Se abrira el instalador grafico del sistema.
4. Pulsa Instalar.
5. Introduce tu contrasena si el sistema la pide.
6. Espera a que el instalador muestre que la instalacion finalizo.

## 3. Instalacion de un AppImage sin terminal

Usa este camino cuando el usuario descargo un archivo AppImage.

1. Abre la carpeta donde esta el archivo.
2. Haz clic derecho sobre el AppImage y entra en Propiedades.
3. Activa la opcion para permitir ejecutar el archivo como programa.
4. Cierra la ventana de Propiedades.
5. Haz doble clic sobre el AppImage para abrirlo.

## 4. Instalacion desde Flatpak o tienda con paquete sandbox

Usa este camino cuando el programa aparece en la tienda como Flatpak o cuando el usuario abre un enlace/archivo compatible desde la interfaz.

1. Abre la Tienda de software.
2. Busca la aplicacion.
3. Si hay varias fuentes, prioriza la que tenga mejor reputacion o la oficial.
4. Pulsa Instalar.
5. Introduce tu contrasena si el sistema la pide.

## Como responder

- Empieza diciendo cual es la ruta mas simple para ese caso.
- Si el usuario no dijo el nombre del programa ni el formato del archivo, pregunta solo una cosa:
  - el nombre del programa, o
  - si ya tiene un archivo descargado y de que tipo es.
- Si el usuario dijo el nombre del programa, primero intenta guiarlo por Tienda de software.
- Si el usuario dijo que ya tiene un .deb o AppImage, no lo mandes a buscarlo de nuevo en la tienda.

## Plantillas utiles

### Si solo dio el nombre del programa

1. Abre la Tienda de software de Zorin.
2. Busca <programa>.
3. Entra en el resultado correcto.
4. Pulsa Instalar.
5. Pon tu contrasena si aparece.
6. Abre la app desde el menu.

### Si ya tiene un .deb descargado

1. Ve a Descargas.
2. Haz doble clic en el archivo .deb.
3. Pulsa Instalar en la ventana que se abra.
4. Escribe tu contrasena si te la pide.
5. Espera a que termine.

### Si ya tiene un AppImage

1. Haz clic derecho en el archivo.
2. Entra en Propiedades.
3. Marca Permitir ejecutar como programa.
4. Haz doble clic para abrirlo.

## Troubleshooting sin terminal

- Si el boton Instalar no aparece: cerrar y volver a abrir el instalador grafico.
- Si el archivo .deb no se abre: clic derecho, abrir con el instalador de software.
- Si el AppImage no arranca: revisar otra vez la opcion de permisos en Propiedades.
- Si la tienda no encuentra el programa: pedir el enlace oficial o confirmar si el usuario ya descargo un archivo.
- Si aparecen dependencias rotas o mensajes tecnicos: no improvisar comandos; cambiar a una explicacion simple y pedir captura o texto exacto del mensaje para guiar el siguiente clic.

## No hacer

- No des comandos de terminal por defecto.
- No mezcles varias rutas a la vez si una sola basta.
- No asumas que el usuario sabe que es un paquete, repositorio o dependencia.
- No uses jerga tecnica si no es necesaria para el siguiente clic.