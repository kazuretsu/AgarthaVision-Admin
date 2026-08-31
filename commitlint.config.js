const commitlintConfig = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      ["dashboard", "records", "export", "ports", "adapters", "auth", "domain", "ui", "ci", "docs"],
    ],
  },
};

export default commitlintConfig;
