# DataBayt AI Labeler

A powerful, modern data annotation tool that leverages AI to accelerate the data labeling process. Upload your data, choose an AI provider, and efficiently review and refine annotations.

## 🚀 Features

- **Multi-format File Support**: Upload JSON, CSV, or TXT files containing your data
- **AI-Powered Labeling**: Integration with OpenAI GPT, Anthropic Claude, and local models
- **Custom Annotation Fields**: Create custom forms with XML configuration
- **In-App XML Editor**: Customize your annotation interface directly in the app
- **Custom Prompts**: Add optional custom instructions for the AI to follow
- **Interactive Review**: Accept, edit, or completely change AI-generated annotations
- **Progress Tracking**: Visual progress indicators and completion statistics
- **Export Results**: Download your annotated data in JSON format (including custom fields)
- **Keyboard Shortcuts**: Efficient navigation and workflow
- **Modern UI**: Clean, responsive interface built with shadcn/ui

## 🛠️ Setup

### Prerequisites

- **Node.js**: Ensure you have Node.js 18+ installed

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server (runs both frontend and backend):
   ```bash
   npm run dev:all
   ```

3. Open your browser and navigate to the displayed local URL (usually `http://localhost:8080`)

## 🔑 API Key Configuration

### OpenAI API Key

1. Click the Settings button (gear icon) in the top-right corner
2. Select "OpenAI GPT" as your model provider
3. Enter your OpenAI API key in the provided field
4. Your API key is stored locally in your browser and never sent to our servers

### Getting an OpenAI API Key

1. Visit [OpenAI's website](https://platform.openai.com/)
2. Sign in or create an account
3. Navigate to the API section
4. Generate a new API key
5. Copy and paste it into the DataBayt AI Labeler settings

**Important**: Your API key should start with `sk-` and is sensitive information. Keep it secure!

## 📁 Data Format Support

### JSON Format
```json
[
  {
    "text": "Your text content here",
    "annotation": "Optional existing label"
  },
  {
    "content": "Alternative content field name",
    "label": "Alternative label field name"
  }
]
```

### CSV Format
```csv
text,label
"Your text content here","Optional existing label"
"Another text sample","Another label"
```

### TXT Format
```
Each line represents a separate data point
This is another data point
And this is a third one
```

## 📖 Usage Guide

### 1. Upload Your Data

- Click the upload button (📁) in the top toolbar
- Select a JSON, CSV, or TXT file containing your data
- The app will automatically parse and load your data points

### 2. Configure AI Provider

- Click the Settings button (⚙️)
- Choose your preferred model provider:
  - **OpenAI GPT**: Most accurate, requires API key
  - **Anthropic Claude**: Alternative AI provider (placeholder implementation)
  - **Local Model**: Simple rule-based model for testing

### 3. Customize Annotation Fields (New!)

You can now customize the annotation interface to match your specific needs:

1. Click the **Customize** button in the "Human Annotation" section.
2. Use the **XML Editor** to define your fields.
3. You can add text inputs, textareas, checkboxes, radio buttons, and select dropdowns.
4. Use `{{columnName}}` to insert values from your data file dynamically.

**Example XML Config:**
```xml
<View>
  <Header value="Sentiment Analysis"/>
  <Text name="text" value="$text"/>
  <Choices name="sentiment" toName="text" choice="single">
    <Choice value="Positive"/>
    <Choice value="Negative"/>
    <Choice value="Neutral"/>
  </Choices>
  <TextArea name="reasoning" toName="text" placeholder="Why this sentiment?"/>
</View>
```

### 4. Add Custom Prompt (Optional)

In the settings dialog, you can add a custom prompt that will be sent to the AI along with each data point:

```
Please classify the following text as positive, negative, or neutral sentiment.
Provide a brief explanation for your classification.
```

### 4. Process with AI

- Click "Process All with AI" to send all data points to your chosen AI provider
- The AI will generate suggested annotations for each data point
- You'll see confidence scores for each suggestion

### 5. Review and Refine

For each data point, you can:
- **Accept**: Use the AI's suggestion as-is
- **Edit**: Modify the AI's suggestion
- **Reject & Reset**: Discard the AI suggestion and start over

### 6. Navigate and Track Progress

- Use the arrow buttons or keyboard shortcuts (← →) to navigate between data points
- Monitor your progress with the visual progress bar
- View completion statistics in the actions panel

### 7. Export Results

- Click the download button (💾) to export your annotated data
- Results are saved as a JSON file containing:
  - Original content
  - Original annotations (if any)
  - AI suggestions
  - Final annotations
  - Status and confidence scores

## ⌨️ Keyboard Shortcuts

- `←` / `→`: Navigate between data points
- `E`: Toggle edit mode
- `S`: Save current annotation
- `?`: Show keyboard shortcuts help

## 📂 Sample Data

The project includes sample data files in the `public` folder:

- `sample-data.json`: JSON format with text and annotations
- `sample-csv.csv`: CSV format with text and labels
- `sample-text.txt`: Plain text format

You can download and use these files to test the application.

## 🔧 Technical Details

### Built With

- **React 18**: Modern React with hooks
- **TypeScript**: Type-safe development
- **Vite**: Fast build tool and dev server
- **Tailwind CSS**: Utility-first CSS framework
- **shadcn/ui**: High-quality UI components
- **OpenAI SDK**: Official OpenAI API integration
- **Lucide React**: Beautiful icons

### Project Structure

```
src/
├── components/
│   ├── ui/                     # shadcn/ui components
│   └── DataLabelingWorkspace.tsx  # Main application component
├── services/
│   └── aiProviders.ts          # AI provider integrations
├── pages/
│   └── Index.tsx              # Main page
└── lib/
    └── utils.ts               # Utility functions
server/
└── index.js                   # Backend proxy server
```

## 🚨 Security Notes

- API keys are stored in browser localStorage and sent to your **local** server proxy
- No data is sent to external servers other than the chosen AI provider
- Requests are routed through the local server (`server/index.js`) to handle CORS and security
- **Production**: When deploying, you must deploy the server component to handle these API requests

## 🐛 Troubleshooting

### Common Issues

1. **"OpenAI API key is required" error**
   - Make sure you've entered a valid API key starting with `sk-`
   - Check that you've saved the settings after entering the key

2. **File upload fails**
   - Ensure your file is in JSON, CSV, or TXT format
   - Check that JSON files contain a valid array structure
   - Verify CSV files have appropriate column headers

3. **AI processing fails**
   - Verify your API key is correct and has sufficient credits
   - Check your internet connection
   - Try with a smaller dataset first

### Getting Help

If you encounter issues:
1. Check the browser console for error messages
2. Verify your API key and internet connection
3. Try with the provided sample data files
4. Ensure you're using a supported file format

## 📄 License

This project is part of the DataBayt AI suite. Please refer to your license agreement for terms of use.

---

**DataBayt AI Labeler** - Accelerating data annotation with AI-powered assistance.# theplatform-
