const lintStagedConfig = {
  "**/*.{ts,tsx}": ["eslint --fix", "prettier --write"],
};

export default lintStagedConfig;
