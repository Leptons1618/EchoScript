import os
import json
from flask_login import UserMixin
from datetime import datetime

# Simple file-based user database
USER_DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'users.json')

# Ensure data directory exists
os.makedirs(os.path.dirname(USER_DB_PATH), exist_ok=True)

class User(UserMixin):
    def __init__(self, id, username, password_hash, email, is_admin=False):
        self.id = id
        self.username = username
        self.password_hash = password_hash
        self.email = email
        self.is_admin = is_admin
        self.created_at = datetime.now().timestamp()

    @staticmethod
    def get(user_id):
        users = User.get_all_users()
        for user in users:
            if user['id'] == user_id:
                return User(
                    id=user['id'],
                    username=user['username'],
                    password_hash=user['password_hash'],
                    email=user['email'],
                    is_admin=user.get('is_admin', False)
                )
        return None

    @staticmethod
    def get_by_username(username):
        users = User.get_all_users()
        for user in users:
            if user['username'].lower() == username.lower():
                return User(
                    id=user['id'],
                    username=user['username'],
                    password_hash=user['password_hash'],
                    email=user['email'],
                    is_admin=user.get('is_admin', False)
                )
        return None

    @staticmethod
    def get_by_email(email):
        users = User.get_all_users()
        for user in users:
            if user['email'].lower() == email.lower():
                return User(
                    id=user['id'],
                    username=user['username'],
                    password_hash=user['password_hash'],
                    email=user['email'],
                    is_admin=user.get('is_admin', False)
                )
        return None

    @staticmethod
    def get_all_users():
        if not os.path.exists(USER_DB_PATH):
            return []
        with open(USER_DB_PATH, 'r') as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return []

    @staticmethod
    def save_user(user_data):
        users = User.get_all_users()
        
        # Create a serializable dict
        user_dict = {
            'id': user_data.id,
            'username': user_data.username,
            'password_hash': user_data.password_hash,
            'email': user_data.email,
            'is_admin': getattr(user_data, 'is_admin', False),
            'created_at': getattr(user_data, 'created_at', datetime.now().timestamp())
        }
        
        # Update if user exists
        for i, user in enumerate(users):
            if user['id'] == user_data.id:
                users[i] = user_dict
                break
        else:
            # Add new user
            users.append(user_dict)
                
        with open(USER_DB_PATH, 'w') as f:
            json.dump(users, f, indent=2)