Write-Host "Testing FatSecret with known UPCs..." -ForegroundColor Cyan
Write-Host ""

# Test health first
try {
  $health = Invoke-WebRequest -Uri "https://worthingtonnutritionsite.onrender.com/health" -UseBasicParsing -TimeoutSec 10
  Write-Host "Health: OK" -ForegroundColor Green
} catch {
  Write-Host "Health: FAILED - $($_.Exception.Message)" -ForegroundColor Red
}

Start-Sleep -Milliseconds 1000

# Test known UPCs
$testUPCs = @{
  "012000136501" = "Coca-Cola Classic";
  "041000006850" = "Pepsi";
  "0030100215981" = "Your product 1";
  "0028400243063" = "Your product 2";
}

foreach ($upc in $testUPCs.Keys) {
  Write-Host ""
  Write-Host "Testing UPC: $upc ($($testUPCs[$upc]))" -ForegroundColor Yellow
  try {
    $url = "https://worthingtonnutritionsite.onrender.com/nutrition?upc=$upc"
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 15
    $json = ConvertFrom-Json $resp.Content
    
    Write-Host "  Status: $(if ($json.found) {'FOUND'} else {'NOT FOUND'})" -ForegroundColor $(if ($json.found) {'Green'} else {'Red'})
    if ($json.found) {
      Write-Host "  Name: $($json.food.food_name)"
      Write-Host "  Source: $($json.source)"
      if ($json.food.servings.serving[0]) {
        $s = $json.food.servings.serving[0]
        Write-Host "  Nutrition: $($s.calories)cal | Protein: $($s.protein)g | Fat: $($s.fat)g | Carbs: $($s.carbohydrate)g"
      }
    } else {
      Write-Host "  Source: $($json.source)"
    }
  } catch {
    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
  }
  Start-Sleep -Milliseconds 1000
}
