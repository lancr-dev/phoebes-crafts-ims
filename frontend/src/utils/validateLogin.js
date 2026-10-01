export const validateLogin = ({ username, password }) => {
  const errors = {};
  if (!username.trim()) {
    errors.username = 'Enter your username.';
  } else if (username.length > 100) {
    errors.username = 'Use a username of 100 characters or fewer.';
  }
  if (!password) {
    errors.password = 'Enter your password.';
  } else if (new TextEncoder().encode(password).length > 1024) {
    errors.password = 'This password is too long.';
  }
  return errors;
};
