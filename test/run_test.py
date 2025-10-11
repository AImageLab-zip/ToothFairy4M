#!/usr/bin/env python3
"""
Simple runner script for the ToothFairy4M upload test
"""

import sys
import os

# Add the test directory to Python path
test_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, test_dir)

try:
    from test_upload import main
    
    print("🦷 ToothFairy4M Upload Test Runner")
    print("=" * 50)
    print("This script will:")
    print("1. Login to the ToothFairy4M system")
    print("2. Get available folders")
    print("3. Upload a patient with multiple modalities")
    print("4. Display upload results")
    print()
    
    # Check if config exists
    if os.path.exists(os.path.join(test_dir, 'config.py')):
        print("✅ Configuration file found")
    else:
        print("⚠️  No config.py found, will use default settings")
        print("   Create a config.py file to customize settings")
    
    print()
    
    # Ask for confirmation
    response = input("Do you want to proceed? (y/N): ").strip().lower()
    
    if response in ['y', 'yes']:
        print()
        main()
    else:
        print("❌ Upload cancelled by user")
        
except ImportError as e:
    print(f"❌ Error importing test_upload: {e}")
    print("Make sure test_upload.py is in the same directory")
except KeyboardInterrupt:
    print("\n⚠️  Upload interrupted by user")
except Exception as e:
    print(f"❌ Unexpected error: {e}")
    import traceback
    traceback.print_exc()
