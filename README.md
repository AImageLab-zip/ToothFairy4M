# ToothFairy4M - Intra-oral Scan Management System

A Django web application for managing, classifying, and visualizing intra-oral scan data (upper + lower STL pairs) with automated bite classification and streamlined medical workflow.

## Features

- **User Authentication**: Role-based access (Standard User, Annotator, Administrator)
- **3D Visualization**: Interactive Three.js viewer for STL scan files
- **Automated Processing**: Pipeline for scan normalization and bite classification
- **Integrated Classification**: Medical-optimized workflow for reviewing and correcting AI predictions
- **One-Click Approval**: Quick "Accept AI" button for efficient validation
- **File Management**: Secure storage and organization of STL files
- **Responsive UI**: Modern Bootstrap-based interface

## Technology Stack

- **Backend**: Django 5.2.4, Python 3.11+
- **Database**: MySQL 8.0 (Docker) / SQLite (Development)
- **Frontend**: Bootstrap 5.3, Three.js, Font Awesome
- **Processing**: NumPy, Trimesh for STL manipulation
- **Deployment**: Docker Compose

## User Roles

### Standard User
- Browse and visualize public scan pairs
- View bite classification results

### Annotator
- Upload scan pairs (upper + lower STLs)
- Review AI predictions with one-click acceptance
- Provide manual corrections with inline editing
- View all scans (public and private)

### Administrator
- Full CRUD operations on patients, scans, and classifications
- Manage user accounts and roles
- Access Django admin interface

## Data Models

### Patient
- Age, gender, and metadata
- Auto-generated unique patient ID

### ScanPair
- Upper and lower jaw STL files (raw and normalized)
- Visibility settings (public/private)
- Upload metadata

### Classification
- Sagittal (left/right): Class I, II-edge, II-full, III
- Vertical: Normal, Deep Bite, Reverse Bite, Open Bite
- Transverse: Normal, Cross Bite, Scissor Bite
- Midline: Centered, Deviated
- Source: Manual (annotator) or Pipeline (automated)

## Medical Workflow

### Optimized for Medical Professionals

The system is designed for **maximum efficiency** in clinical settings:

1. **AI-First Approach**: Automated processing generates initial classifications
2. **Quick Review**: Medical professionals see AI predictions with clear visual status
3. **One-Click Approval**: Single "Accept AI" button for cases where AI is correct
4. **Rapid Correction**: Inline editing for quick adjustments without page navigation
5. **Visual Distinction**: Clear badges distinguish between AI predictions and verified classifications

### Classification States

- **🔄 PROCESSING**: Scan is being analyzed by AI (1-2 minutes)
- **📋 AI PREDICTION**: Ready for medical review (blue theme, "PENDING REVIEW")
- **✅ VERIFIED**: Manually reviewed and approved (purple theme, "VERIFIED")

## Quick Start

### Option 1: Docker (Recommended)

1. **Clone and start services**:
   ```bash
   git clone <repository>
   cd ToothFairy4M
   docker-compose up -d
   ```

2. **Run database migrations**:
   ```bash
   docker-compose exec web python manage.py makemigrations
   docker-compose exec web python manage.py migrate
   ```

3. **Create superuser**:
   ```bash
   docker-compose exec web python manage.py createsuperuser
   ```

4. **Access the application**:
   - Web app: http://localhost:8000
   - Admin: http://localhost:8000/admin

### Option 2: Local Development

1. **Setup virtual environment**:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

2. **Install dependencies**:
   ```bash
   pip install Django mysqlclient Pillow numpy trimesh django-cors-headers
   ```

3. **Run migrations and start server**:
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   python manage.py createsuperuser
   python manage.py runserver
   ```

## Workflow

1. **User Registration**: Create account with default Standard User role
2. **Role Assignment**: Admin assigns Annotator/Admin roles via Django admin
3. **Scan Upload**: Annotator uploads upper + lower STL pairs
4. **Automated Processing**: Pipeline normalizes scans and generates AI classifications
5. **Medical Review**: In the 3D viewer, medical professionals can:
   - **Accept AI predictions** with one click
   - **Correct predictions** with inline editing
   - **View both scans simultaneously** while making decisions
6. **Final Verification**: Classifications are marked as verified once reviewed

## Processing Pipeline

The automated pipeline triggers on scan upload:

1. **Normalization**: Centers meshes and scales to unit size
2. **Classification**: Analyzes mesh geometry for bite relationships
3. **Storage**: Saves normalized files and classification results
4. **Notification**: Updates UI to show "PENDING REVIEW" status

*Note: Current implementation includes a placeholder classification algorithm. In production, this would integrate with specialized ML models for dental analysis.*

## 3D Viewer Features

- **Interactive Controls**: Rotate, pan, zoom with mouse/touch
- **Dual View**: Show upper, lower, or both jaws simultaneously
- **Wireframe Mode**: Toggle for detailed mesh inspection
- **Integrated Classification**: Review and edit classifications without leaving viewer
- **Real-time Updates**: Changes saved instantly with visual feedback

## File Structure

```
ToothFairy4M/
├── manage.py
├── requirements.txt
├── docker-compose.yml
├── Dockerfile
├── toothfairy/          # Django project settings
├── scans/               # Main application
│   ├── models.py        # Data models
│   ├── views.py         # View controllers
│   ├── forms.py         # Django forms
│   ├── processing.py    # STL processing pipeline
│   └── signals.py       # Event handlers
├── templates/           # HTML templates
├── storage/             # STL file storage (Docker volume)
└── static/              # Static assets
```

## Development Notes

- **Medical UX**: Workflow optimized for clinical efficiency (minimal clicks)
- **File Upload**: STL files stored in organized directory structure
- **3D Viewer**: Uses Three.js with STLLoader and OrbitControls
- **Processing**: Async-friendly design (ready for Celery integration)
- **Security**: Role-based permissions, file validation
- **Scalability**: Stateless design, Docker-ready

## API Endpoints

- `/api/scan/<id>/data/` - 3D viewer data (JSON)
- `/scan/<id>/` - Integrated viewer and classification (HTML)
- `/upload/` - Scan upload form
- `/scans/` - Scan list with status indicators

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## License

This project is licensed under the MIT License.

## Support

For questions or support, please open an issue in the GitHub repository. 