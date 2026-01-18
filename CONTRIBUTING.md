# Contributing to DataBayt AI Labeler

Thank you for your interest in contributing to DataBayt AI Labeler! We welcome contributions from the community to help make this tool better for everyone.

## 🚀 Getting Started

1. **Fork the repository** on GitHub.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/annotate-ai-muse.git
   cd annotate-ai-muse
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Start the development server**:
   ```bash
   npm run dev:all
   ```
   This command starts both the frontend (Vite) and the backend proxy server.

## 🛠️ Project Structure

- **`src/components`**: React components. `DataLabelingWorkspace.tsx` is the main workspace.
- **`src/services`**: Service layers for API calls (`aiProviders.ts`) and data management (`xmlConfigService.ts`).
- **`src/types`**: TypeScript definitions (`data.ts`).
- **`server/`**: Express backend proxy for handling API requests securely.

### Key Features Implementation

- **XML Configuration**: The annotation interface is dynamic, driven by XML. See `src/services/xmlConfigService.ts` for parsing logic.
- **Data Persistence**: Data points and their annotations (including custom fields) are managed in `useDataLabeling.ts`.
- **AI Integration**: New AI providers should be added to `src/services/aiProviders.ts`.

## 🤝 How to Contribute

1. **Create a new branch** for your feature or bugfix:
   ```bash
   git checkout -b feature/amazing-feature
   ```
2. **Make your changes**. Please ensure your code follows the existing style and conventions.
3. **Test your changes**. Verify that the application runs correctly and all features work as expected.
4. **Commit your changes** with a descriptive message:
   ```bash
   git commit -m "feat: Add amazing feature"
   ```
5. **Push to your fork**:
   ```bash
   git push origin feature/amazing-feature
   ```
6. **Open a Pull Request** on the main repository.

## 📝 Code Style

- We use **TypeScript** for type safety. Please ensure all types are properly defined.
- We use **Tailwind CSS** for styling.
- Follow the existing component structure and naming conventions.

## 🐛 Reporting Bugs

If you find a bug, please open an issue on GitHub with:
- A clear description of the issue
- Steps to reproduce
- Expected vs. actual behavior
- Screenshots (if applicable)

## 📄 License

By contributing, you agree that your contributions will be licensed under the project's license.
