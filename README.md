# ToothFairy4M

A Django web application for managing and processing dental and medical imaging data, including Intraoral Scans (IOS) and Cone Beam Computed Tomography (CBCT).

## Main Features

- **Bite Classification**: Automatic and manual classification of dental occlusion
- **AI-Powered Captioning**: IOS and CBCT annotation using speech-to-text technology
- **CBCT Panoramic Extraction**: Automated extraction of panoramic views from CBCT scans
- **IOS Normalization**: Standardized processing of intraoral scan data
- **Multi-Modality Support**: Handle IOS, intraoral photos, teleradiography, and panoramic images
- **Data Export**: Structured export of patient data and imaging files
- **User Management**: Role-based access control and project organization

## Description

ToothFairy4M is a comprehensive platform designed for dental and maxillofacial imaging research. It provides tools for uploading, processing, annotating, and exporting medical imaging data with support for multiple modalities. The application features a modern web interface with 3D visualization capabilities and automated processing workflows.

Live instance: [https://toothfairy4m.ing.unimore.it](https://toothfairy4m.ing.unimore.it)

## Run Behind Traefik On zip-dgx

The `web` container is exposed to Traefik through the shared `proxy-net` network.
The route itself is configured in `/home/nicola/Desktop/traefik-zip-dgx/traefik/dynamic/routes.yml`.

- Host rule: `zip-dgx.ing.unimore.it`
- Entry point: HTTPS (`websecure`)
- Internal app port: `8000`
- Shared network with Traefik: `proxy-net`

Start sequence:

1. Start this stack: `make up`
2. Start Traefik stack from `/home/nicola/Desktop/traefik-zip-dgx`: `make up`
3. Open `https://zip-dgx.ing.unimore.it/`

## Contact

For more information or to request an account, please contact:

**Luca Lumetti**  
Email: [luca.lumetti@unimore.it](mailto:luca.lumetti@unimore.it)
