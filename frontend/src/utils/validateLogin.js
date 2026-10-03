import { MAX_USERNAME_LENGTH, isValidUsername, isValidPassword } from '../../../shared/inputValidation.mjs';

export const validateLogin = (values) => {
  const { username, password } = values ?? {};
  const errors = {};
  if (typeof username !== 'string' || !username.trim()) {
    errors.username = 'Enter your username.';
  } else if (!isValidUsername(username)) {
    errors.username = `Use a single-line username of ${MAX_USERNAME_LENGTH} characters or fewer.`;
  }
  if (typeof password !== 'string' || !password) {
    errors.password = 'Enter your password.';
  } else if (!isValidPassword(password)) {
    errors.password = 'This password is too long.';
  }
  return errors;
};
