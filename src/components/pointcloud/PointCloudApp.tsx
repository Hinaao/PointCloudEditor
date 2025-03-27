'use client';

import React, { useState, useRef, useEffect, createContext } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { PointCloudScene } from './PointCloudScene';
import { loadCSV, loadPCD, createColorMapForCSV } from '@/lib/utils/point-cloud-utils';
import { FileUploader } from './FileUploader';

// shadcn/uiコンポーネント
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ModeToggle } from "@/components/mode-toggle";

// アイコン
import { FolderOpen, Save, Eye, Edit3, Move, RotateCw, Trash2, DownloadCloud, 
         ChevronDown, Plus, XCircle, Layers, Settings, Maximize, Grid, Home,
         ZoomIn, ZoomOut, Check, X } from 'lucide-react';

// アプリケーション全体で共有する状態のコンテキスト
export const AppContext = createContext({
  heightFilterEnabled: false,
  heightRange: [-10, 10] as [number, number]
});

// メインアプリケーションコンポーネント
const PointCloudApp = () => {
  // 状態管理
  const [pointClouds, setPointClouds] = useState<any[]>([]);
  const [selectedPoints, setSelectedPoints] = useState<string[]>([]);
  const [activeMode, setActiveMode] = useState("view"); // "view" または "edit"
  const [activeTransform, setActiveTransform] = useState<string | null>(null); // 'translate', 'rotate', null
  const [pointSize, setPointSize] = useState(2);
  const [isLoading, setIsLoading] = useState(false);
  const [colorMapType, setColorMapType] = useState("default"); // "default", "rainbow", "elevation"
  
  // 高さフィルター関連の状態
  const [heightFilterEnabled, setHeightFilterEnabled] = useState(false);
  const [heightBounds, setHeightBounds] = useState<[number, number]>([-10, 10]); // デフォルト範囲
  const [heightRange, setHeightRange] = useState<[number, number]>([-10, 10]);   // 現在の選択範囲
  
  // ファイルドロップハンドラー
  async function handleFileDrop(acceptedFiles: File[]) {
    setIsLoading(true);
    const newPointClouds = [...pointClouds];
    
    for (let i = 0; i < acceptedFiles.length; i++) {
      const file = acceptedFiles[i];
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      
      try {
        let pointCloudData;
        
        if (extension === 'csv') {
          pointCloudData = await loadCSV(file, colorMapType, updateHeightBounds);
        } else if (extension === 'pcd') {
          pointCloudData = await loadPCD(file, updateHeightBounds);
        } else {
          console.error('Unsupported file format:', extension);
          continue;
        }
        
        const newPointCloud = {
          id: `${Date.now()}-${i}`, // 一意のID
          name: file.name,
          data: pointCloudData,
          visible: true,
          type: extension
        };
        
        newPointClouds.push(newPointCloud);
      } catch (error) {
        console.error('Error loading file:', file.name, error);
      }
    }
    
    setPointClouds(newPointClouds);
    setIsLoading(false);
  }
  
  // CSVエクスポート機能（RGB対応）
  const exportToCSV = () => {
    let csvContent = "X,Y,Z,R,G,B\n"; // RGB情報を含むヘッダー
    
    // 選択されている点群のみエクスポートする場合
    const cloudsToExport = selectedPoints.length > 0 ? 
      pointClouds.filter(pc => selectedPoints.includes(pc.id)) : 
      pointClouds;
    
    cloudsToExport.forEach(pc => {
      if (pc.data && pc.data.positions) {
        // 位置データとカラーデータの取得
        const positions = pc.data.positions;
        const colors = pc.data.colors;
        
        const pointCount = positions.length / 3;
        
        for (let i = 0; i < pointCount; i++) {
          // 現在の変換行列を考慮した座標を取得（実際の実装では変換行列の適用が必要）
          const x = positions[i*3];
          const y = positions[i*3+1];
          const z = positions[i*3+2];
          
          // RGB値（0～1の範囲を0～255に変換）
          const r = Math.round(colors[i*3] * 255);
          const g = Math.round(colors[i*3+1] * 255);
          const b = Math.round(colors[i*3+2] * 255);
          
          // CSV行に追加
          csvContent += `${x},${y},${z},${r},${g},${b}\n`;
        }
      }
    });
    
    // ダウンロードリンク生成
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'exported_pointcloud.csv';
    link.click();
    
    URL.revokeObjectURL(url);
  };
  
  // 点群選択処理
  const handleSelectPointCloud = (id: string) => {
    setSelectedPoints(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };
  
  // 点群削除処理
  const deleteSelectedPointClouds = () => {
    if (selectedPoints.length === 0) return;
    
    setPointClouds(prev => prev.filter(pc => !selectedPoints.includes(pc.id)));
    setSelectedPoints([]);
  };
  
  // 点群表示切替
  const togglePointCloudVisibility = (id: string) => {
    setPointClouds(prev => prev.map(pc => 
      pc.id === id ? { ...pc, visible: !pc.visible } : pc
    ));
  };
  
  // 変換ツール選択
  const selectTransformTool = (tool: string) => {
    setActiveTransform(activeTransform === tool ? null : tool);
  };
  
  // 点サイズ変更
  const handlePointSizeChange = (value: number[]) => {
    setPointSize(value[0]);
  };
  
  // カラーマップタイプ変更
  const handleColorMapChange = (type: string) => {
    setColorMapType(type);
    
    // CSVファイルの点群のカラーマップを更新
    setPointClouds(prev => prev.map(pc => {
      if (pc.type === 'csv' && !pc.data.hasRGB && pc.data.zValues) {
        const newColors = createColorMapForCSV(pc.data.zValues, type);
        return {
          ...pc,
          data: {
            ...pc.data,
            colors: newColors
          }
        };
      }
      return pc;
    }));
  };
  
  // 高さ範囲の更新（ファイル読み込み時に呼び出される）
  const updateHeightBounds = (minZ: number, maxZ: number) => {
    setHeightBounds(prevBounds => {
      // 現在の範囲と新しい点群の範囲を比較して、より広い範囲に更新
      const newMinZ = Math.min(prevBounds[0], minZ);
      const newMaxZ = Math.max(prevBounds[1], maxZ);
      
      // 高さ範囲の選択値も更新
      setHeightRange([newMinZ, newMaxZ]);
      
      return [newMinZ, newMaxZ] as [number, number];
    });
  };
  
  // 高さ範囲スライダー変更ハンドラ
  const handleHeightRangeChange = (value: number[]) => {
    setHeightRange([value[0], value[1]]);
  };
  
  // 高さ範囲入力フィールド変更ハンドラ
  const handleHeightInputChange = (index: number, value: string) => {
    const numValue = parseFloat(value);
    
    if (!isNaN(numValue)) {
      const newRange = [...heightRange] as [number, number];
      newRange[index] = numValue;
      
      // 上限が下限を下回らないようにする
      if (index === 0 && numValue > newRange[1]) {
        newRange[0] = newRange[1];
      } else if (index === 1 && numValue < newRange[0]) {
        newRange[1] = newRange[0];
      }
      
      setHeightRange(newRange);
    }
  };
  
  // コンテキストに高さフィルターの状態を設定
  const appContextValue = {
    heightFilterEnabled,
    heightRange
  };
  
  return (
    <AppContext.Provider value={appContextValue}>
      <div className="flex h-screen flex-col bg-background">
        {/* ヘッダー */}
        <header className="flex items-center px-4 py-2 border-b">
          <h1 className="text-xl font-bold mr-4">3D点群エディタ</h1>
          
          <div className="ml-auto flex items-center gap-2">
            <ModeToggle />
          </div>
        </header>
        
        <div className="flex flex-1 overflow-hidden">
          {/* サイドバー */}
          <aside className="w-64 border-r p-4 flex flex-col">
            {/* ファイルアップロードエリア */}
            <FileUploader 
              onFilesUpload={handleFileDrop}
              isLoading={isLoading}
            />
            
            {/* 点群リスト */}
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold">点群ファイル</h2>
              <div className="flex gap-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7" 
                        onClick={deleteSelectedPointClouds}
                        disabled={selectedPoints.length === 0}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>選択した点群を削除</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7"
                        onClick={exportToCSV}
                        disabled={pointClouds.length === 0}
                      >
                        <DownloadCloud className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>CSVでエクスポート</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
            
            <ScrollArea className="flex-1 -mx-4 px-4">
              {pointClouds.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  点群ファイルがありません
                </div>
              ) : (
                <div className="space-y-2">
                  {pointClouds.map(pc => (
                    <Card 
                      key={pc.id}
                      className={`cursor-pointer transition-all ${
                        selectedPoints.includes(pc.id) ? 'ring-1 ring-primary' : ''
                      }`}
                      onClick={() => handleSelectPointCloud(pc.id)}
                    >
                      <CardHeader className="p-3 pb-1">
                        <div className="flex items-center">
                          <div className="flex-1 truncate">
                            <div className="flex items-center gap-1">
                              <span className="font-medium truncate">{pc.name}</span>
                              <Badge variant="outline" className="ml-1">
                                {pc.type.toUpperCase()}
                              </Badge>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 ml-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePointCloudVisibility(pc.id);
                            }}
                          >
                            <Eye className={`h-3 w-3 ${pc.visible ? '' : 'text-muted-foreground'}`} />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{pc.data.positions ? (pc.data.positions.length / 3).toLocaleString() : 0} 点</span>
                          <span>
                            {pc.type === 'csv' && (pc.data.hasRGB ? '色情報あり' : 'Z値カラー')}
                            {pc.type === 'pcd' && (pc.data.hasColor ? '色情報あり' : '単色')}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
            
            {/* 設定パネル */}
            <div className="mt-4 border-t pt-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="point-size">点サイズ</Label>
                    <span className="text-xs text-muted-foreground">{pointSize}</span>
                  </div>
                  <Slider
                    id="point-size"
                    min={1}
                    max={10}
                    step={0.5}
                    value={[pointSize]}
                    onValueChange={handlePointSizeChange}
                  />
                </div>
                
                {/* 高さフィルター */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="height-filter">高さフィルター</Label>
                    <Switch
                      id="height-filter-toggle"
                      checked={heightFilterEnabled}
                      onCheckedChange={setHeightFilterEnabled}
                    />
                  </div>
                  
                  <div className={heightFilterEnabled ? "opacity-100" : "opacity-50"}>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>最小値: {heightRange[0].toFixed(1)}</span>
                      <span>最大値: {heightRange[1].toFixed(1)}</span>
                    </div>
                    <Slider
                      id="height-range"
                      min={heightBounds[0]}
                      max={heightBounds[1]}
                      step={(heightBounds[1] - heightBounds[0]) / 100}
                      value={heightRange}
                      onValueChange={handleHeightRangeChange}
                      disabled={!heightFilterEnabled}
                    />
                    <div className="flex justify-between text-xs mt-2">
                      <div className="flex items-center">
                        <Label htmlFor="min-height" className="w-10">下限:</Label>
                        <Input
                          id="min-height"
                          type="number"
                          value={heightRange[0].toFixed(1)}
                          onChange={(e) => handleHeightInputChange(0, e.target.value)}
                          className="h-7 w-20"
                          disabled={!heightFilterEnabled}
                        />
                      </div>
                      <div className="flex items-center">
                        <Label htmlFor="max-height" className="w-10">上限:</Label>
                        <Input
                          id="max-height"
                          type="number"
                          value={heightRange[1].toFixed(1)}
                          onChange={(e) => handleHeightInputChange(1, e.target.value)}
                          className="h-7 w-20"
                          disabled={!heightFilterEnabled}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>カラーマップ</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant={colorMapType === "default" ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleColorMapChange("default")}
                      className="h-8"
                    >
                      標準
                    </Button>
                    <Button
                      variant={colorMapType === "rainbow" ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleColorMapChange("rainbow")}
                      className="h-8"
                    >
                      虹色
                    </Button>
                    <Button
                      variant={colorMapType === "elevation" ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleColorMapChange("elevation")}
                      className="h-8"
                    >
                      標高
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </aside>
          
          {/* メインコンテンツ */}
          <main className="flex-1 flex flex-col overflow-hidden">
            {/* ツールバー */}
            <div className="p-2 border-b flex items-center">
              <Tabs value={activeMode} onValueChange={setActiveMode} className="w-auto">
                <TabsList>
                  <TabsTrigger value="view" className="flex items-center gap-1">
                    <Eye className="h-4 w-4" />
                    <span>表示</span>
                  </TabsTrigger>
                  <TabsTrigger value="edit" className="flex items-center gap-1">
                    <Edit3 className="h-4 w-4" />
                    <span>編集</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              
              <Separator orientation="vertical" className="mx-4 h-6" />
              
              {activeMode === "edit" && (
                <div className="flex items-center gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={activeTransform === "translate" ? "default" : "outline"}
                          size="sm"
                          onClick={() => selectTransformTool("translate")}
                          className="h-8"
                          disabled={selectedPoints.length === 0}
                        >
                          <Move className="h-4 w-4 mr-1" />
                          移動
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>選択した点群を移動</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={activeTransform === "rotate" ? "default" : "outline"}
                          size="sm"
                          onClick={() => selectTransformTool("rotate")}
                          className="h-8"
                          disabled={selectedPoints.length === 0}
                        >
                          <RotateCw className="h-4 w-4 mr-1" />
                          回転
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>選択した点群を回転</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
              
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={exportToCSV}
                  disabled={pointClouds.length === 0}
                >
                  <DownloadCloud className="h-4 w-4 mr-1" />
                  エクスポート
                </Button>
              </div>
            </div>
            
            {/* 3Dキャンバス */}
            <div className="flex-1 relative">
              <Canvas
                camera={{ position: [0, 0, 5], far: 10000 }}
                className="w-full h-full"
              >
                <ambientLight intensity={0.8} />
                <PointCloudScene
                  pointClouds={pointClouds}
                  selectedPoints={selectedPoints}
                  editMode={activeMode === "edit"}
                  activeTransform={activeTransform}
                  onSelect={handleSelectPointCloud}
                  pointSize={pointSize}
                />
              </Canvas>
              
              {/* ローディングインジケータ */}
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                  <div className="flex flex-col items-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                    <p className="mt-2 text-sm">ファイルを読み込み中...</p>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </AppContext.Provider>
  );
};

export default PointCloudApp;