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
  Target
} from "lucide-react";
import sampleData from "@/assets/sample-data.jpg";

const AnnotationWorkspace = () => {
  const [currentSample, setCurrentSample] = useState(1);
  const [annotations, setAnnotations] = useState<string[]>([]);
  const [aiSuggestions] = useState([
    { label: "Data Visualization", confidence: 0.95, type: "primary" },
    { label: "Dashboard Chart", confidence: 0.89, type: "secondary" },
    { label: "Analytics UI", confidence: 0.76, type: "tertiary" }
  ]);

  const totalSamples = 247;
  const completedSamples = 85;
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
                <h1 className="text-xl font-semibold text-foreground">DataAnnotate AI</h1>
                <p className="text-sm text-muted-foreground">Sample {currentSample} of {totalSamples}</p>
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
          {/* Data Viewer */}
          <div className="flex-1 p-6 overflow-auto">
            <Card className="h-full flex items-center justify-center bg-gradient-subtle shadow-elegant">
              <div className="w-full max-w-4xl">
                <img 
                  src={sampleData} 
                  alt="Data sample for annotation"
                  className="w-full h-auto rounded-lg shadow-lg border border-border"
                />
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