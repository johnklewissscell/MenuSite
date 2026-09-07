$baseUrl = "https://worthingtonnutritionsite.onrender.com"
$testUpcs = @(
    "0030100215981", "0028400243063", "0016571940355", "0853004004952",
    "0025293001398", "0076183003145", "0016571954369", "0041900072827",
    "0028400239349", "0028400042437", "0000006827465", "0016571959203"
)

Write-Host "Waiting 30 seconds for Render redeploy..." -ForegroundColor Cyan
Start-Sleep -Seconds 30

Write-Host "`n=== Testing All Products ===" -ForegroundColor Yellow
Write-Host "Base URL: $baseUrl`n"

$results = @()

foreach ($upc in $testUpcs) {
    try {
        $productResp = Invoke-WebRequest -Uri "$baseUrl/product?upc=$upc" -UseBasicParsing -ErrorAction Stop
        $productData = ConvertFrom-Json $productResp.Content
        
        $productName = $productData.product.product_name
        $brand = $productData.product.brand_name
        $nutrition = $productData.nutrition
        
        $nutritionStatus = if ($nutrition.found) { "FOUND" } else { "NOT FOUND" }
        $calories = if ($nutrition.found) { $nutrition.calories } else { "N/A" }
        
        Write-Host "[$upc]" -ForegroundColor Cyan
        Write-Host "  Product: $productName" -ForegroundColor Green
        Write-Host "  Brand:   $brand" -ForegroundColor Green
        Write-Host "  Nutrition: $nutritionStatus | Calories: $calories" -ForegroundColor $(if ($nutrition.found) { "Green" } else { "Yellow" })
        
        $results += @{
            upc = $upc
            name = $productName
            nutrition = $nutrition.found
            calories = $calories
        }
    } catch {
        Write-Host "[$upc] ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    Start-Sleep -Milliseconds 500
}

Write-Host "`n=== Summary ===" -ForegroundColor Yellow
$withNutrition = $results | Where-Object { $_.nutrition } | Measure-Object
$total = $results | Measure-Object

Write-Host "Products found:       $($total.Count)" -ForegroundColor Green
Write-Host "With nutrition data:  $($withNutrition.Count)" -ForegroundColor $(if ($withNutrition.Count -eq $total.Count) { "Green" } else { "Yellow" })
Write-Host "Missing nutrition:    $($total.Count - $withNutrition.Count)" -ForegroundColor $(if ($total.Count - $withNutrition.Count -eq 0) { "Green" } else { "Yellow" })
