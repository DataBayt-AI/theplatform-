import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  Edit3,
  Keyboard,
  TrendingUp,
  Clock,
  Save
} from "lucide-react";
// Translation data will be inline

const AnnotationWorkspace = () => {
  const [currentSample, setCurrentSample] = useState(1);
  const [annotations, setAnnotations] = useState<string[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [aiSuggestions] = useState([
    { label: "Accurate Translation", confidence: 0.95, type: "primary" },
    { label: "Grammar Correct", confidence: 0.91, type: "secondary" },
    { label: "Context Appropriate", confidence: 0.84, type: "tertiary" }
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          handlePrevSample();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleNextSample();
          break;
        case 's':
          e.preventDefault();
          // Save annotations
          break;
        case 'e':
          e.preventDefault();
          setIsEditMode(!isEditMode);
          break;
        case '?':
          e.preventDefault();
          setShowShortcuts(!showShortcuts);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentSample, isEditMode, showShortcuts]);

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
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentSample(currentSample + 1);
        setAnnotations([]);
        setIsTransitioning(false);
      }, 150);
    }
  };

  const handlePrevSample = () => {
    if (currentSample > 1) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentSample(currentSample - 1);
        setAnnotations([]);
        setIsTransitioning(false);
      }, 150);
    }
  };

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-background relative">
        {/* Keyboard Shortcuts Overlay */}
        {showShortcuts && (
          <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
            <Card className="p-6 max-w-md animate-scale-in">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Keyboard className="w-5 h-5" />
                Keyboard Shortcuts
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Next Sample</span>
                  <kbd className="px-2 py-1 bg-muted rounded text-xs">→</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Previous Sample</span>
                  <kbd className="px-2 py-1 bg-muted rounded text-xs">←</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Toggle Edit</span>
                  <kbd className="px-2 py-1 bg-muted rounded text-xs">E</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Save</span>
                  <kbd className="px-2 py-1 bg-muted rounded text-xs">S</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Show Shortcuts</span>
                  <kbd className="px-2 py-1 bg-muted rounded text-xs">?</kbd>
                </div>
              </div>
              <Button 
                className="w-full mt-4" 
                variant="outline" 
                onClick={() => setShowShortcuts(false)}
              >
                Close
              </Button>
            </Card>
          </div>
        )}

        {/* Floating Quick Actions */}
        <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                className="rounded-full shadow-elegant hover:shadow-glow transition-all duration-300 bg-gradient-primary"
                onClick={() => setShowShortcuts(true)}
              >
                <Keyboard className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>Keyboard Shortcuts (?)</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                className="rounded-full shadow-elegant hover:shadow-glow transition-all duration-300"
                variant="outline"
              >
                <Save className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>Quick Save (S)</p>
            </TooltipContent>
          </Tooltip>
        </div>

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
                <div className="flex items-center gap-2">
                  <Progress value={progress} className="w-32 h-2" />
                  <span className="text-xs text-muted-foreground font-mono">
                    {Math.round(progress)}%
                  </span>
                </div>
              </div>
              <Separator orientation="vertical" className="h-8" />
              <div className="flex gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handlePrevSample}
                      disabled={currentSample === 1}
                      className="hover:shadow-md transition-all duration-200"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Previous (←)</p>
                  </TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleNextSample}
                      disabled={currentSample === totalSamples}
                      className="hover:shadow-md transition-all duration-200"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Next (→)</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>

        {/* Workspace */}
        <div className="flex-1 flex">
          {/* Translation Viewer */}
          <div className="flex-1 p-6 overflow-auto">
            <Card className={`h-full bg-gradient-subtle shadow-elegant transition-all duration-300 ${
              isTransitioning ? 'opacity-50 scale-[0.98]' : 'opacity-100 scale-100'
            }`}>
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
                  <Card className="p-3 text-center hover:shadow-md transition-all duration-200 border-success/20 bg-success/5">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <div className="w-2 h-2 rounded-full bg-success animate-pulse"></div>
                      <div className="text-sm font-medium text-success">Grammar</div>
                    </div>
                    <div className="text-xs text-muted-foreground">Excellent</div>
                  </Card>
                  <Card className="p-3 text-center hover:shadow-md transition-all duration-200 border-success/20 bg-success/5">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <div className="w-2 h-2 rounded-full bg-success animate-pulse"></div>
                      <div className="text-sm font-medium text-success">Context</div>
                    </div>
                    <div className="text-xs text-muted-foreground">Accurate</div>
                  </Card>
                  <Card className="p-3 text-center hover:shadow-md transition-all duration-200 border-warning/20 bg-warning/5">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <div className="w-2 h-2 rounded-full bg-warning animate-pulse"></div>
                      <div className="text-sm font-medium text-warning">Fluency</div>
                    </div>
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
                  <Card key={index} className="p-3 hover:shadow-lg hover:scale-[1.02] transition-all duration-200 cursor-pointer group border-primary/10 hover:border-primary/30" 
                        onClick={() => handleAddAnnotation(suggestion.label)}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Brain className="w-3 h-3 text-ai-primary group-hover:animate-pulse" />
                          <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                            {suggestion.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="text-xs text-muted-foreground">
                            {Math.round(suggestion.confidence * 100)}% confidence
                          </div>
                          <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-ai rounded-full transition-all duration-500 group-hover:animate-pulse"
                              style={{ width: `${suggestion.confidence * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
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
              <div className="grid grid-cols-2 gap-3">
                <Card className="p-3 bg-gradient-subtle hover:shadow-md transition-all duration-200">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <TrendingUp className="w-3 h-3 text-primary" />
                      <div className="text-lg font-bold text-primary">{annotations.length}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">annotations</div>
                  </div>
                </Card>
                
                <Card className="p-3 bg-gradient-subtle hover:shadow-md transition-all duration-200">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Clock className="w-3 h-3 text-warning" />
                      <div className="text-lg font-bold text-warning">2:34</div>
                    </div>
                    <div className="text-xs text-muted-foreground">avg time</div>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </TooltipProvider>
  );
};

export default AnnotationWorkspace;