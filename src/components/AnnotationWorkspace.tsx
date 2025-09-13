import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  Check, 
  X, 
  RotateCcw,
  Zap,
  Brain,
  Target,
  Edit3
} from "lucide-react";
// Translation data will be inline

const AnnotationWorkspace = () => {
  const [currentSample, setCurrentSample] = useState(1);
  const [annotations, setAnnotations] = useState<string[]>([]);
  const [aiSuggestions] = useState([
    { label: "Accurate Translation", confidence: 0.95, type: "primary" },
    { label: "Grammar Correct", confidence: 0.91, type: "secondary" },
    { label: "Context Appropriate", confidence: 0.84, type: "tertiary" }
  ]);

  const [translationPairs] = useState([
    {
      id: 1,
      english: "The weather is beautiful today.",
      arabic: "الطقس جميل اليوم.",
      aiUpdated: true,
      confidence: 0.95
    },
    {
      id: 2, 
      english: "I would like to book a table for two people.",
      arabic: "أريد أن أحجز طاولة لشخصين.",
      aiUpdated: false,
      confidence: 0.87
    },
    {
      id: 3,
      english: "Technology is changing our world rapidly.",
      arabic: "التكنولوجيا تغير عالمنا بسرعة.",
      aiUpdated: true,
      confidence: 0.92
    }
  ]);

  const currentTranslation = translationPairs[currentSample - 1] || translationPairs[0];

  const totalSamples = translationPairs.length;
  const completedSamples = 2;
  const progress = (completedSamples / totalSamples) * 100;

  const handleAddAnnotation = (label: string) => {
    if (!annotations.includes(label)) {
      setAnnotations([...annotations, label]);
    }
  };

  const handleRemoveAnnotation = (label: string) => {
    setAnnotations(annotations.filter(ann => ann !== label));
  };

  const handleNextSample = () => {
    if (currentSample < totalSamples) {
      setCurrentSample(currentSample + 1);
      setAnnotations([]);
    }
  };

  const handlePrevSample = () => {
    if (currentSample > 1) {
      setCurrentSample(currentSample - 1);
      setAnnotations([]);
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
                <Target className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">DataBayt AI</h1>
                <p className="text-sm text-muted-foreground">Translation {currentSample} of {totalSamples}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium text-foreground">{completedSamples} completed</p>
                <Progress value={progress} className="w-32 h-2" />
              </div>
              <Separator orientation="vertical" className="h-8" />
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handlePrevSample}
                  disabled={currentSample === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleNextSample}
                  disabled={currentSample === totalSamples}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Workspace */}
        <div className="flex-1 flex">
          {/* Translation Viewer */}
          <div className="flex-1 p-6 overflow-auto">
            <Card className="h-full bg-gradient-subtle shadow-elegant">
              <div className="p-8 space-y-8">
                {/* English Text */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">English</Badge>
                    {currentTranslation.aiUpdated && (
                      <Badge className="text-xs bg-success/10 text-success border-success/20">
                        AI Updated
                      </Badge>
                    )}
                  </div>
                  <div className="bg-card rounded-lg p-6 border border-border shadow-sm">
                    <p className="text-lg leading-relaxed text-foreground">
                      {currentTranslation.english}
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Arabic Translation */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">Arabic Translation</Badge>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-success"></div>
                      <span className="text-xs text-muted-foreground">
                        {Math.round(currentTranslation.confidence * 100)}% confidence
                      </span>
                    </div>
                  </div>
                  <div className={`bg-card rounded-lg p-6 border shadow-sm transition-all duration-300 relative group ${
                    currentTranslation.aiUpdated 
                      ? 'border-success/50 bg-success/5 shadow-lg' 
                      : 'border-border'
                  }`}>
                    <p className="text-lg leading-relaxed text-foreground text-right pr-12" dir="rtl">
                      {currentTranslation.arabic}
                    </p>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="absolute top-4 left-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-primary/10"
                    >
                      <Edit3 className="w-4 h-4" />
                    </Button>
                  </div>
                  {currentTranslation.aiUpdated && (
                    <div className="flex items-center gap-2 text-xs text-success">
                      <Sparkles className="w-3 h-3" />
                      <span>Translation improved by AI</span>
                    </div>
                  )}
                </div>

                {/* Quality Indicators */}
                <div className="grid grid-cols-3 gap-4 pt-4">
                  <Card className="p-3 text-center">
                    <div className="text-sm font-medium text-success">Grammar</div>
                    <div className="text-xs text-muted-foreground">Excellent</div>
                  </Card>
                  <Card className="p-3 text-center">
                    <div className="text-sm font-medium text-success">Context</div>
                    <div className="text-xs text-muted-foreground">Accurate</div>
                  </Card>
                  <Card className="p-3 text-center">
                    <div className="text-sm font-medium text-warning">Fluency</div>
                    <div className="text-xs text-muted-foreground">Good</div>
                  </Card>
                </div>
              </div>
            </Card>
          </div>

          {/* AI Suggestions Panel */}
          <div className="w-80 border-l border-border bg-card p-6">
            <div className="space-y-6">
              {/* AI Header */}
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-ai flex items-center justify-center shadow-ai">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">AI Suggestions</h2>
                  <p className="text-xs text-muted-foreground">Powered by ML models</p>
                </div>
              </div>

              {/* AI Suggestions */}
              <div className="space-y-3">
                {aiSuggestions.map((suggestion, index) => (
                  <Card key={index} className="p-3 hover:shadow-md transition-all duration-200 cursor-pointer" 
                        onClick={() => handleAddAnnotation(suggestion.label)}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Brain className="w-3 h-3 text-ai-primary" />
                          <span className="text-sm font-medium text-foreground">{suggestion.label}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="text-xs text-muted-foreground">
                            {Math.round(suggestion.confidence * 100)}% confidence
                          </div>
                          <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-ai rounded-full transition-all duration-300"
                              style={{ width: `${suggestion.confidence * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" className="ml-2">
                        <Check className="w-3 h-3" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>

              <Separator />

              {/* Current Annotations */}
              <div>
                <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-warning" />
                  Current Annotations
                </h3>
                <div className="space-y-2">
                  {annotations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No annotations yet</p>
                  ) : (
                    annotations.map((annotation, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                          {annotation}
                        </Badge>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => handleRemoveAnnotation(annotation)}
                          className="ml-2 text-destructive hover:text-destructive"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <Separator />

              {/* Actions */}
              <div className="space-y-2">
                <Button className="w-full bg-gradient-primary hover:shadow-elegant transition-all duration-200">
                  <Check className="w-4 h-4 mr-2" />
                  Save Annotations
                </Button>
                <Button variant="outline" className="w-full">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset
                </Button>
              </div>

              {/* Stats */}
              <Card className="p-3 bg-gradient-subtle">
                <div className="text-center">
                  <div className="text-lg font-bold text-primary">{annotations.length}</div>
                  <div className="text-xs text-muted-foreground">annotations added</div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnnotationWorkspace;