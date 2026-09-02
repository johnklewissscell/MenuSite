Write-Host "Testing FatSecret API access from Render..." -ForegroundColor Cyan
Write-Host ""

$upcs = @('0030100215981', '0028400243063', '0016571940355', '0853004004952', '0025293001398')
$successCount = 0
$foundCount = 0

foreach ($upc in $upcs) {
  Write-Host "UPC: $upc" -ForegroundColor Yellow
  try {
    $url = "https://worthingtonnutritionsite.onrender.com/nutrition?upc=$upc"
    $resp = Invoke-WebRequest -Uri $url -TimeoutSec 15 -UseBasicParsing -ErrorAction Stop
    $json = ConvertFrom-Json $resp.Content
    $successCount++
    
    if ($json.found -eq $true) {
      $food = $json.food
      Write-Host "  FOUND: $($food.food_name)" -ForegroundColor Green
      if ($food.servings.serving -and $food.servings.serving.Count -gt 0) {
        $s = $food.servings.serving[0]
        Write-Host "    Serving: $($s.serving_description)" -ForegroundColor Cyan
        Write-Host "    Calories: $($s.calories) | Protein: $($s.protein)g | Fat: $($s.fat)g | Carbs: $($s.carbohydrate)g | Fiber: $($s.fiber)g" -ForegroundColor Cyan
        $foundCount++
      }
    } else {
      Write-Host "  Not found in FatSecret" -ForegroundColor Red
    }
  } catch {
    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
  }
  Write-Host ""
  Start-Sleep -Milliseconds 500
}

Write-Host "==================" -ForegroundColor Cyan
Write-Host "Results: $successCount/$($upcs.Count) successful | $foundCount products found" -ForegroundColor Cyan
