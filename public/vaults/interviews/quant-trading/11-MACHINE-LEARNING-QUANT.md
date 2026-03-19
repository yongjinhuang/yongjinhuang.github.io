# Chapter 11: Machine Learning for Quantitative Trading

## From Pattern Recognition to Alpha Generation

Machine learning has transformed quantitative finance. Every major quant fund now employs ML techniques -- from simple regularized regressions at Two Sigma to deep reinforcement learning at Renaissance Technologies. But the application of ML to financial markets is fundamentally different from ML in computer vision, NLP, or recommendation systems. The signal-to-noise ratio is abysmal, the data is non-stationary, and your competition is other PhD-wielding quants trying to exploit the same patterns.

This chapter covers the entire ML pipeline for quant trading: feature engineering, supervised and unsupervised models, deep learning, reinforcement learning, NLP, proper cross-validation, ensemble methods, alternative data, and the many pitfalls that separate profitable ML systems from expensive curve-fitting exercises.

```
+------------------------------------------------------------------+
|              ML IN QUANTITATIVE TRADING                           |
+------------------------------------------------------------------+
|                                                                  |
|  RAW DATA  -->  FEATURES  -->  MODEL  -->  SIGNAL  -->  TRADES   |
|                                                                  |
|  Price,        Returns,       XGBoost,    Alpha       Portfolio  |
|  Volume,       Momentum,      LSTM,       scores,     positions, |
|  Alt data,     Volatility,    RL agent,   confidence  execution  |
|  News          Cross-section  Ensemble    estimates    orders     |
|                                                                  |
|  THE CRITICAL DIFFERENCE: In finance, tomorrow's exam questions  |
|  are DIFFERENT from today's. The distribution shifts constantly.  |
+------------------------------------------------------------------+
```

---

## 11.1 ML in Finance: What Makes It Different

### The Signal-to-Noise Problem

In image classification, signal-to-noise is high -- a cat picture looks like a cat every time. In financial markets, the signal-to-noise ratio is catastrophically low.

```
Signal-to-Noise Comparison:
+---------------------------------------------------+
| Domain              | SNR Estimate   | Accuracy   |
+---------------------------------------------------+
| Image Classification| Very High      | >99%       |
| Speech Recognition  | High           | >95%       |
| Machine Translation | Moderate       | ~85%       |
| Financial Returns   | Extremely Low  | ~51%       |
+---------------------------------------------------+

A 51% accuracy in predicting direction can be enormously
profitable -- IF transaction costs are low enough and
you trade frequently enough for the edge to compound.
```

Consider daily stock returns. The expected daily return for equities is roughly 0.04% (about 10% annually / 252 trading days). The daily standard deviation is about 1.5%. That means:

```python
import numpy as np

expected_daily_return = 0.10 / 252   # ~0.04%
daily_volatility = 0.015              # 1.5%
daily_snr = expected_daily_return / daily_volatility  # ~0.026

# To detect a signal this weak, you need:
# n > (z_alpha / SNR)^2 observations
z_alpha = 1.96  # 95% confidence
min_observations = (z_alpha / daily_snr) ** 2
print(f"Minimum observations needed: {min_observations:.0f}")
# ~5,700 trading days = ~22 years of daily data
```

This means you need decades of data just to confirm a simple signal exists -- and by then, the market regime has probably changed multiple times.

### Non-Stationarity

Financial data violates the fundamental ML assumption that training and test data come from the same distribution.

```
STATIONARITY vs FINANCIAL REALITY

Stationary Process (what ML expects):
  Distribution at t=1  ==  Distribution at t=100  ==  Distribution at t=1000

Financial Markets (what you actually get):

  2005-2007           2008-2009           2010-2015           2020-2021
  +-----------+       +-----------+       +-----------+       +-----------+
  | Low vol,  |       | Crisis,   |       | QE-driven |       | COVID,    |
  | carry     |       | high corr,|       | low vol,  |       | meme      |
  | trades    |       | delever   |       | momentum  |       | stocks,   |
  | work      |       | cascade   |       | works     |       | retail    |
  +-----------+       +-----------+       +-----------+       +-----------+

  Each regime has different statistical properties.
  A model trained on one regime may fail catastrophically in the next.
```

### Overfitting: The #1 Enemy

In most ML domains, overfitting reduces accuracy by a few percent. In finance, overfitting turns a profitable backtest into a money-losing live strategy.

```
THE OVERFITTING SPECTRUM IN FINANCE

  Underfitting              Sweet Spot              Overfitting
  |________________________|________|_________________________|
  Simple linear            Regularized              100-feature
  model, few               model with               neural net,
  features, low            proper CV,               no CV,
  in-sample fit            good OOS fit             perfect IS fit

  In-sample R^2:   0.01         0.03                     0.15
  Out-of-sample:   0.005        0.02                    -0.05  <-- LOSING MONEY

  The relationship between IS and OOS is NOT monotonic.
  More complexity usually means WORSE live performance.
```

**Why most ML finance papers fail to replicate:**

1. **Data snooping** -- Testing many strategies on the same data without adjusting significance
2. **Survivorship bias** -- Training on stocks that survived, ignoring delisted ones
3. **Look-ahead bias** -- Using information not available at prediction time
4. **Transaction cost neglect** -- Ignoring the cost of actually trading the signal
5. **Overfitting to specific regimes** -- Training on a bull market, deploying into a bear market
6. **Publication bias** -- Only positive results get published

```python
# Demonstration: How easy it is to overfit
import numpy as np

np.random.seed(42)
n_days = 252 * 5  # 5 years of daily data
n_features = 200  # 200 random features

# Generate PURE NOISE -- no signal exists
X = np.random.randn(n_days, n_features)
y = np.random.randn(n_days)  # random returns

# Split into train/test
train_X, test_X = X[:1000], X[1000:]
train_y, test_y = y[:1000], y[1000:]

# Fit a linear model -- it WILL find "patterns" in noise
from numpy.linalg import lstsq
beta = lstsq(train_X, train_y, rcond=None)[0]

train_pred = train_X @ beta
test_pred = test_X @ beta

train_corr = np.corrcoef(train_pred, train_y)[0, 1]
test_corr = np.corrcoef(test_pred, test_y)[0, 1]

print(f"Train correlation: {train_corr:.4f}")   # ~0.60 (looks great!)
print(f"Test correlation:  {test_corr:.4f}")     # ~0.00 (worthless)

# With 200 features and 1000 observations, you ALWAYS overfit.
# Rule of thumb: keep features < observations / 10
```

---

## 11.2 Feature Engineering for Alpha

Feature engineering is where domain knowledge meets data science. The best quant ML models succeed not because of exotic architectures but because of carefully crafted features.

### Price-Based Features

```python
import pandas as pd
import numpy as np

def compute_price_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute price-based features from OHLCV data.
    df must have columns: open, high, low, close, volume
    Returns new DataFrame with features (no mutation of input).
    """
    features = pd.DataFrame(index=df.index)

    # --- Returns at multiple horizons ---
    for period in [1, 5, 10, 21, 63, 126, 252]:
        features[f'ret_{period}d'] = df['close'].pct_change(period)

    # --- Volatility features ---
    for window in [10, 21, 63]:
        features[f'vol_{window}d'] = (
            df['close'].pct_change().rolling(window).std() * np.sqrt(252)
        )

    # --- Realized volatility (Parkinson) ---
    # Uses high-low range, more efficient than close-to-close
    for window in [10, 21]:
        log_hl = np.log(df['high'] / df['low'])
        features[f'parkinson_vol_{window}d'] = (
            log_hl.pow(2).rolling(window).mean()
            / (4 * np.log(2))
        ).apply(np.sqrt) * np.sqrt(252)

    # --- Momentum / Mean reversion signals ---
    # RSI
    delta = df['close'].diff()
    gain = delta.where(delta > 0, 0.0).rolling(14).mean()
    loss = (-delta.where(delta < 0, 0.0)).rolling(14).mean()
    rs = gain / loss.replace(0, np.nan)
    features['rsi_14'] = 100 - (100 / (1 + rs))

    # Distance from moving averages
    for window in [20, 50, 200]:
        ma = df['close'].rolling(window).mean()
        features[f'dist_ma_{window}'] = (df['close'] - ma) / ma

    # --- MACD ---
    ema_12 = df['close'].ewm(span=12).mean()
    ema_26 = df['close'].ewm(span=26).mean()
    features['macd'] = ema_12 - ema_26
    features['macd_signal'] = features['macd'].ewm(span=9).mean()
    features['macd_hist'] = features['macd'] - features['macd_signal']

    # --- High-low range features ---
    features['intraday_range'] = (df['high'] - df['low']) / df['close']
    features['close_to_high'] = (df['close'] - df['low']) / (
        df['high'] - df['low']
    ).replace(0, np.nan)

    return features
```

### Volume Features

```python
def compute_volume_features(df: pd.DataFrame) -> pd.DataFrame:
    """Volume-based features that capture participation and conviction."""
    features = pd.DataFrame(index=df.index)

    # Volume relative to its own history
    for window in [10, 21, 63]:
        vol_ma = df['volume'].rolling(window).mean()
        features[f'vol_ratio_{window}d'] = df['volume'] / vol_ma

    # VWAP distance
    typical_price = (df['high'] + df['low'] + df['close']) / 3
    cumulative_tp_vol = (typical_price * df['volume']).rolling(20).sum()
    cumulative_vol = df['volume'].rolling(20).sum()
    vwap = cumulative_tp_vol / cumulative_vol
    features['dist_vwap_20'] = (df['close'] - vwap) / vwap

    # On-Balance Volume (OBV) trend
    obv = (np.sign(df['close'].diff()) * df['volume']).cumsum()
    for window in [10, 21]:
        features[f'obv_slope_{window}d'] = (
            obv.rolling(window).apply(
                lambda x: np.polyfit(range(len(x)), x, 1)[0], raw=False
            )
        )

    # Volume-price divergence: price up but volume declining
    features['vol_price_corr_20'] = (
        df['close'].pct_change()
        .rolling(20)
        .corr(df['volume'].pct_change())
    )

    return features
```

### Fractional Differentiation (Lopez de Prado)

A key insight from Lopez de Prado: traditional differencing (returns) removes too much memory from price series, while raw prices are non-stationary. Fractional differentiation finds the minimum amount of differencing needed for stationarity while preserving maximum predictive information.

```
DIFFERENCING SPECTRUM

  d = 0.0          d = 0.4          d = 1.0
  Raw prices       Fractionally     Returns
  (non-stationary, differentiated   (stationary,
   max memory)     (stationary,      min memory)
                    good memory)

  +-------------+  +-------------+  +-------------+
  |    /        |  |  ~~~~~~~    |  | +-+-+-+-+   |
  |   /         |  |   ~~~~~~   |  | | | | | |   |
  |  /          |  |  ~~~~~     |  | +-+-+-+-+   |
  | /           |  |   ~~~~     |  |   noise     |
  +-------------+  +-------------+  +-------------+
  ADF test: fail   ADF test: pass   ADF test: pass
  Memory: 100%     Memory: ~60%     Memory: ~5%
```

```python
def frac_diff(series: pd.Series, d: float, threshold: float = 1e-4) -> pd.Series:
    """
    Fractionally differentiate a time series.
    d: fractional differencing order (0 < d < 1)
    threshold: minimum weight to include in convolution
    """
    weights = [1.0]
    k = 1
    while True:
        w = -weights[-1] * (d - k + 1) / k
        if abs(w) < threshold:
            break
        weights.append(w)
        k += 1

    weights = np.array(weights)
    width = len(weights)

    result = pd.Series(index=series.index, dtype=float)
    for i in range(width - 1, len(series)):
        window = series.iloc[i - width + 1:i + 1].values
        result.iloc[i] = np.dot(weights[::-1], window[-width:])

    return result

# Usage: find minimum d for stationarity
from statsmodels.tsa.stattools import adfuller

def find_min_d(prices: pd.Series, max_d: float = 1.0, step: float = 0.05) -> float:
    """Find minimum fractional differencing order for stationarity."""
    for d in np.arange(0.0, max_d + step, step):
        diffed = frac_diff(prices, d).dropna()
        if len(diffed) < 50:
            continue
        adf_stat = adfuller(diffed, maxlag=1)[1]  # p-value
        if adf_stat < 0.05:
            return d
    return max_d
```

### Cross-Sectional Features

These features compare a stock against its peers -- critical for equity strategies.

```python
def compute_cross_sectional_features(
    returns_df: pd.DataFrame, window: int = 21
) -> pd.DataFrame:
    """
    Compute cross-sectional features.
    returns_df: DataFrame with stocks as columns, dates as index.
    """
    features = {}

    # Cross-sectional rank (0 to 1)
    features['cs_rank'] = returns_df.rolling(window).mean().rank(
        axis=1, pct=True
    )

    # Z-score relative to cross-section
    cs_mean = returns_df.rolling(window).mean().mean(axis=1)
    cs_std = returns_df.rolling(window).mean().std(axis=1)
    features['cs_zscore'] = returns_df.rolling(window).mean().sub(
        cs_mean, axis=0
    ).div(cs_std, axis=0)

    # Industry-relative momentum
    # (Requires sector mapping -- simplified here)
    features['relative_strength'] = (
        returns_df.rolling(window).mean()
        .sub(returns_df.rolling(window).mean().mean(axis=1), axis=0)
    )

    return features
```

### Complete Feature Pipeline

```python
class AlphaFeaturePipeline:
    """End-to-end feature pipeline for alpha modeling."""

    def __init__(self, horizons: list[int] = None):
        self.horizons = horizons or [1, 5, 10, 21, 63]
        self.feature_names: list[str] = []

    def build_features(self, ohlcv: pd.DataFrame) -> pd.DataFrame:
        """Build all features from OHLCV data."""
        price_feats = compute_price_features(ohlcv)
        volume_feats = compute_volume_features(ohlcv)

        # Fractionally differentiated price
        frac_d = find_min_d(ohlcv['close'])
        price_feats['frac_diff_close'] = frac_diff(ohlcv['close'], frac_d)

        all_features = pd.concat([price_feats, volume_feats], axis=1)

        # Lag features to prevent look-ahead bias
        all_features = all_features.shift(1)

        # Drop rows with NaN (from rolling windows)
        all_features = all_features.dropna()

        self.feature_names = all_features.columns.tolist()
        return all_features

    def build_targets(
        self, close: pd.Series, horizon: int = 5, method: str = 'returns'
    ) -> pd.Series:
        """Build target variable for prediction."""
        if method == 'returns':
            return close.pct_change(horizon).shift(-horizon)
        elif method == 'direction':
            return (close.pct_change(horizon).shift(-horizon) > 0).astype(int)
        elif method == 'quintile':
            fwd_ret = close.pct_change(horizon).shift(-horizon)
            return pd.qcut(fwd_ret, 5, labels=False, duplicates='drop')
        else:
            raise ValueError(f"Unknown target method: {method}")
```

---

## 11.3 Supervised Learning Models

### Target Variable Design

The choice of target variable profoundly impacts model performance.

```
TARGET VARIABLE OPTIONS

  1. Raw Forward Returns       y = r(t+h)
     - Noisy, hard to predict
     - Good for regression

  2. Binary Direction          y = sign(r(t+h))
     - Reduces noise
     - Classification problem
     - Ignores magnitude

  3. Triple Barrier Method     y = {+1, 0, -1}
     (Lopez de Prado)
     - Accounts for path
     - Labels based on first barrier hit

     Price
      |        Upper barrier (take profit)
      |  ------*---------------------------------
      |       /|
      |      / |
      |     /  |
      |----*---|---------- Entry
      |    |   |
      |    |   |
      |  --+---+--------- Lower barrier (stop loss)
      |    |   |
      |    t   t+h        Vertical barrier (max holding)

  4. Quantile Labels           y in {0, 1, 2, 3, 4}
     - Rank into quintiles
     - Reduces outlier impact
```

### The Triple Barrier Method

```python
def triple_barrier_labels(
    close: pd.Series,
    events: pd.DatetimeIndex,
    upper: float = 0.02,     # take profit threshold
    lower: float = -0.02,    # stop loss threshold
    max_holding: int = 10    # max holding period in bars
) -> pd.DataFrame:
    """
    Apply the triple barrier labeling method.
    Returns DataFrame with columns: [ret, label, holding_period]
    """
    results = []

    for entry_date in events:
        entry_idx = close.index.get_loc(entry_date)
        entry_price = close.iloc[entry_idx]
        end_idx = min(entry_idx + max_holding, len(close) - 1)

        label = 0
        exit_idx = end_idx
        exit_ret = 0.0

        for i in range(entry_idx + 1, end_idx + 1):
            ret = (close.iloc[i] / entry_price) - 1

            if ret >= upper:
                label = 1
                exit_idx = i
                exit_ret = ret
                break
            elif ret <= lower:
                label = -1
                exit_idx = i
                exit_ret = ret
                break
        else:
            exit_ret = (close.iloc[end_idx] / entry_price) - 1
            label = int(np.sign(exit_ret))

        results.append({
            'entry_date': entry_date,
            'ret': exit_ret,
            'label': label,
            'holding_period': exit_idx - entry_idx
        })

    return pd.DataFrame(results).set_index('entry_date')
```

### Model Comparison

```
MODEL COMPARISON FOR ALPHA PREDICTION

+--------------------+-------+--------+------------+--------+----------+
| Model              | Speed | Interp | Nonlinear  | Overfit| Finance  |
|                    |       |        | Capacity   | Risk   | Track    |
+--------------------+-------+--------+------------+--------+----------+
| Linear Regression  | +++++ | +++++  | None       | Low    | Baseline |
| Ridge/Lasso        | +++++ | ++++   | None       | Low    | Good     |
| Elastic Net        | +++++ | ++++   | None       | Low    | Good     |
| Random Forest      | +++   | ++     | Medium     | Medium | Good     |
| XGBoost/LightGBM   | ++++  | ++     | High       | Medium | Best     |
| Neural Network     | ++    | +      | Very High  | High   | Mixed    |
| LSTM               | +     | +      | Very High  | High   | Overhyped|
| Transformer        | +     | +      | Extreme    | V.High | Research |
+--------------------+-------+--------+------------+--------+----------+

Industry consensus: Gradient boosted trees (XGBoost/LightGBM) offer
the best risk-adjusted performance for tabular financial data.
```

### XGBoost Alpha Model

```python
import xgboost as xgb
from sklearn.metrics import accuracy_score, log_loss
import pandas as pd
import numpy as np

class XGBoostAlphaModel:
    """
    XGBoost-based alpha model with proper financial cross-validation.
    """

    def __init__(self, objective: str = 'binary:logistic'):
        self.params = {
            'objective': objective,
            'max_depth': 4,              # shallow trees reduce overfitting
            'learning_rate': 0.05,       # low LR + early stopping
            'subsample': 0.7,            # row sampling
            'colsample_bytree': 0.7,     # feature sampling
            'min_child_weight': 100,     # min samples per leaf (high for finance)
            'reg_alpha': 0.1,            # L1 regularization
            'reg_lambda': 1.0,           # L2 regularization
            'eval_metric': 'logloss',
            'n_jobs': -1,
            'verbosity': 0,
        }
        self.model = None
        self.feature_importance_ = None

    def train(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        X_val: pd.DataFrame,
        y_val: pd.Series,
        n_rounds: int = 1000,
        early_stopping: int = 50
    ) -> dict:
        """Train with early stopping on validation set."""
        dtrain = xgb.DMatrix(X_train, label=y_train)
        dval = xgb.DMatrix(X_val, label=y_val)

        self.model = xgb.train(
            self.params,
            dtrain,
            num_boost_round=n_rounds,
            evals=[(dtrain, 'train'), (dval, 'val')],
            early_stopping_rounds=early_stopping,
            verbose_eval=False
        )

        # Store feature importance
        importance = self.model.get_score(importance_type='gain')
        self.feature_importance_ = pd.Series(importance).sort_values(
            ascending=False
        )

        # Evaluate
        val_pred = self.model.predict(dval)
        val_labels = (val_pred > 0.5).astype(int)

        return {
            'best_iteration': self.model.best_iteration,
            'val_logloss': log_loss(y_val, val_pred),
            'val_accuracy': accuracy_score(y_val, val_labels),
        }

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """Generate alpha scores (probabilities)."""
        if self.model is None:
            raise RuntimeError("Model not trained yet")
        dmat = xgb.DMatrix(X)
        return self.model.predict(dmat)

    def get_top_features(self, n: int = 20) -> pd.Series:
        """Return top N features by importance."""
        if self.feature_importance_ is None:
            raise RuntimeError("Model not trained yet")
        return self.feature_importance_.head(n)


# --- Usage ---
def run_alpha_model(features_df, target_series):
    """End-to-end training pipeline."""
    # Align features and target
    common_idx = features_df.index.intersection(target_series.dropna().index)
    X = features_df.loc[common_idx]
    y = target_series.loc[common_idx]

    # Time-based split (NEVER random split for financial data)
    split_date = X.index[int(len(X) * 0.7)]
    val_date = X.index[int(len(X) * 0.85)]

    X_train = X.loc[:split_date]
    y_train = y.loc[:split_date]
    X_val = X.loc[split_date:val_date]
    y_val = y.loc[split_date:val_date]
    X_test = X.loc[val_date:]
    y_test = y.loc[val_date:]

    model = XGBoostAlphaModel()
    metrics = model.train(X_train, y_train, X_val, y_val)

    # Generate out-of-sample predictions
    test_scores = model.predict(X_test)

    # Evaluate: IC (information coefficient)
    ic = np.corrcoef(test_scores, y_test)[0, 1]
    print(f"Out-of-sample IC: {ic:.4f}")
    print(f"Top features:\n{model.get_top_features(10)}")

    return model, test_scores
```

### Ridge Regression Baseline

Always start with a linear baseline. If XGBoost cannot beat a well-regularized linear model, the nonlinear signal likely does not exist.

```python
from sklearn.linear_model import RidgeCV
from sklearn.preprocessing import StandardScaler

def ridge_baseline(X_train, y_train, X_test, y_test):
    """Ridge regression baseline with cross-validated alpha."""
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    model = RidgeCV(
        alphas=[0.01, 0.1, 1.0, 10.0, 100.0, 1000.0],
        cv=5  # OK for ridge; use purged CV for final eval
    )
    model.fit(X_train_scaled, y_train)

    pred = model.predict(X_test_scaled)
    ic = np.corrcoef(pred, y_test)[0, 1]
    print(f"Ridge IC: {ic:.4f}, best alpha: {model.alpha_:.1f}")
    return model, pred
```

---

## 11.4 Deep Learning for Finance

### When Deep Learning Helps vs. Doesn't

```
DEEP LEARNING DECISION MATRIX FOR FINANCE

  +-------------------+-------------------+--------------------------+
  | Data Type         | DL Advantage      | Recommendation           |
  +-------------------+-------------------+--------------------------+
  | Tabular (returns, | Minimal           | Use XGBoost/LightGBM     |
  |   fundamentals)   |                   |                          |
  +-------------------+-------------------+--------------------------+
  | Order book        | Moderate          | CNN or Transformer       |
  | sequences         |                   |                          |
  +-------------------+-------------------+--------------------------+
  | Text (news,       | Large             | FinBERT, LLMs            |
  |   filings, calls) |                   |                          |
  +-------------------+-------------------+--------------------------+
  | Satellite imagery | Large             | CNNs                     |
  +-------------------+-------------------+--------------------------+
  | Multi-modal       | Large             | Custom architectures     |
  | (text + numeric)  |                   |                          |
  +-------------------+-------------------+--------------------------+
  | Tick-level HFT    | Moderate-Large    | TCN, Transformer         |
  +-------------------+-------------------+--------------------------+

  Rule: If your data fits in a pandas DataFrame, try tree models first.
  Deep learning shines with unstructured data (text, images, sequences).
```

### LSTM for Return Prediction

```python
import torch
import torch.nn as nn

class LSTMAlphaModel(nn.Module):
    """LSTM model for sequential financial data."""

    def __init__(
        self,
        input_size: int,
        hidden_size: int = 64,
        num_layers: int = 2,
        dropout: float = 0.3,
        output_size: int = 1
    ):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            dropout=dropout,
            batch_first=True
        )
        self.dropout = nn.Dropout(dropout)
        self.fc = nn.Linear(hidden_size, output_size)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x shape: (batch, seq_len, input_size)
        lstm_out, _ = self.lstm(x)
        # Take last timestep
        last_hidden = lstm_out[:, -1, :]
        out = self.dropout(last_hidden)
        return self.fc(out)


def create_sequences(
    features: np.ndarray, targets: np.ndarray, seq_len: int = 20
) -> tuple[np.ndarray, np.ndarray]:
    """Create overlapping sequences for LSTM input."""
    X_seq, y_seq = [], []
    for i in range(seq_len, len(features)):
        X_seq.append(features[i - seq_len:i])
        y_seq.append(targets[i])
    return np.array(X_seq), np.array(y_seq)


def train_lstm(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_val: np.ndarray,
    y_val: np.ndarray,
    input_size: int,
    epochs: int = 100,
    lr: float = 1e-3,
    batch_size: int = 64
) -> LSTMAlphaModel:
    """Train LSTM with early stopping."""
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

    model = LSTMAlphaModel(input_size=input_size).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-5)
    criterion = nn.MSELoss()

    train_dataset = torch.utils.data.TensorDataset(
        torch.FloatTensor(X_train), torch.FloatTensor(y_train)
    )
    train_loader = torch.utils.data.DataLoader(
        train_dataset, batch_size=batch_size, shuffle=False  # preserve time order
    )

    best_val_loss = float('inf')
    patience_counter = 0

    for epoch in range(epochs):
        model.train()
        for batch_X, batch_y in train_loader:
            batch_X, batch_y = batch_X.to(device), batch_y.to(device)
            optimizer.zero_grad()
            pred = model(batch_X).squeeze()
            loss = criterion(pred, batch_y)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

        # Validation
        model.eval()
        with torch.no_grad():
            val_X = torch.FloatTensor(X_val).to(device)
            val_y = torch.FloatTensor(y_val).to(device)
            val_pred = model(val_X).squeeze()
            val_loss = criterion(val_pred, val_y).item()

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            patience_counter = 0
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
        else:
            patience_counter += 1
            if patience_counter >= 10:
                break

    model.load_state_dict(best_state)
    return model
```

### Temporal Convolutional Network (TCN)

TCNs often outperform LSTMs for financial time series because they are easier to train and parallelize.

```python
class CausalConv1d(nn.Module):
    """Causal convolution -- only looks at past data."""

    def __init__(self, in_channels: int, out_channels: int,
                 kernel_size: int, dilation: int = 1):
        super().__init__()
        self.padding = (kernel_size - 1) * dilation
        self.conv = nn.Conv1d(
            in_channels, out_channels, kernel_size,
            padding=self.padding, dilation=dilation
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = self.conv(x)
        # Remove future padding
        return out[:, :, :x.size(2)]


class TCNBlock(nn.Module):
    """Single TCN residual block."""

    def __init__(self, in_channels: int, out_channels: int,
                 kernel_size: int, dilation: int, dropout: float = 0.2):
        super().__init__()
        self.conv1 = CausalConv1d(in_channels, out_channels, kernel_size, dilation)
        self.conv2 = CausalConv1d(out_channels, out_channels, kernel_size, dilation)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(dropout)
        self.residual = (
            nn.Conv1d(in_channels, out_channels, 1)
            if in_channels != out_channels else nn.Identity()
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = self.dropout(self.relu(self.conv1(x)))
        out = self.dropout(self.relu(self.conv2(out)))
        return self.relu(out + self.residual(x))


class TCNModel(nn.Module):
    """Temporal Convolutional Network for financial time series."""

    def __init__(self, input_size: int, num_channels: list[int] = None,
                 kernel_size: int = 3, dropout: float = 0.2):
        super().__init__()
        num_channels = num_channels or [32, 32, 16]
        layers = []
        for i, out_ch in enumerate(num_channels):
            in_ch = input_size if i == 0 else num_channels[i - 1]
            layers.append(TCNBlock(in_ch, out_ch, kernel_size, 2**i, dropout))
        self.network = nn.Sequential(*layers)
        self.fc = nn.Linear(num_channels[-1], 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, seq_len, features) -> transpose to (batch, features, seq_len)
        out = self.network(x.transpose(1, 2))
        return self.fc(out[:, :, -1])
```

### Autoencoder for Anomaly Detection

Autoencoders learn "normal" market behavior. When reconstruction error spikes, something unusual is happening -- useful for regime detection and risk management.

```python
class MarketAutoencoder(nn.Module):
    """Autoencoder for detecting market anomalies / regime changes."""

    def __init__(self, input_dim: int, latent_dim: int = 8):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.ReLU(),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, latent_dim),
        )
        self.decoder = nn.Sequential(
            nn.Linear(latent_dim, 32),
            nn.ReLU(),
            nn.Linear(32, 64),
            nn.ReLU(),
            nn.Linear(64, input_dim),
        )

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        latent = self.encoder(x)
        reconstructed = self.decoder(latent)
        return reconstructed, latent

    def anomaly_score(self, x: torch.Tensor) -> torch.Tensor:
        """Higher score = more anomalous."""
        reconstructed, _ = self.forward(x)
        return torch.mean((x - reconstructed) ** 2, dim=1)
```

---

## 11.5 Reinforcement Learning for Trading

### MDP Formulation

Trading maps naturally to a Markov Decision Process.

```
TRADING AS MDP

  State (s_t)                Action (a_t)           Reward (r_t)
  +--------------------+     +---------------+      +----------------+
  | Current position   |     | Buy           |      | Portfolio PnL  |
  | Market features    |---->| Sell          |----->| - Transaction  |
  | Portfolio value    |     | Hold          |      |   costs        |
  | Time features      |     | Position size |      | - Risk penalty |
  +--------------------+     +---------------+      +----------------+
        |                                                   |
        +---------------------------------------------------+
                    Environment steps forward

  Key challenges:
  1. Delayed rewards (actions today affect future P&L)
  2. Transaction costs make "do nothing" the default optimal action
  3. Non-stationary environment
  4. Partial observability
```

### State, Action, and Reward Design

```
STATE DESIGN
+--------------------------------------------------+
| Component         | Features                      |
+--------------------------------------------------+
| Market state      | Returns, vol, spread, volume  |
| Position state    | Current holdings, cash, PnL   |
| Technical state   | RSI, MACD, Bollinger bands    |
| Temporal state    | Day of week, time of day      |
| Risk state        | Drawdown, VaR, exposure       |
+--------------------------------------------------+

ACTION SPACE
+--------------------------------------------------+
| Discrete actions:  {-1, 0, +1}    (short/flat/long)
| Continuous actions: [-1, +1]      (position fraction)
| Multi-asset:       vector of positions per asset
+--------------------------------------------------+

REWARD DESIGN
+--------------------------------------------------+
| Simple:       r_t = portfolio_return_t
| Risk-adj:     r_t = return_t - lambda * risk_t
| Sharpe-based: r_t = return_t / rolling_vol_t
| With costs:   r_t = return_t - |delta_pos| * cost
+--------------------------------------------------+
```

### DQN Trading Agent

```python
import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
from collections import deque
import random

class DQNNetwork(nn.Module):
    """Q-network for trading agent."""

    def __init__(self, state_dim: int, n_actions: int = 3):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(state_dim, 128),
            nn.ReLU(),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, n_actions)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class TradingEnvironment:
    """Simple trading environment for a single asset."""

    def __init__(
        self,
        prices: np.ndarray,
        features: np.ndarray,
        transaction_cost: float = 0.001,
        risk_penalty: float = 0.5
    ):
        self.prices = prices
        self.features = features
        self.transaction_cost = transaction_cost
        self.risk_penalty = risk_penalty
        self.n_steps = len(prices)
        self.reset()

    def reset(self) -> np.ndarray:
        self.current_step = 0
        self.position = 0       # -1, 0, or 1
        self.portfolio_value = 1.0
        self.returns_history: list[float] = []
        return self._get_state()

    def _get_state(self) -> np.ndarray:
        market_state = self.features[self.current_step]
        position_state = np.array([self.position, self.portfolio_value])
        return np.concatenate([market_state, position_state])

    def step(self, action: int) -> tuple[np.ndarray, float, bool]:
        """
        action: 0=short, 1=flat, 2=long
        Returns: (next_state, reward, done)
        """
        target_position = action - 1  # maps {0,1,2} to {-1,0,1}

        # Calculate return
        price_return = (
            self.prices[self.current_step + 1] / self.prices[self.current_step]
        ) - 1

        # PnL from position
        pnl = self.position * price_return

        # Transaction cost for position changes
        trade_cost = abs(target_position - self.position) * self.transaction_cost

        # Risk penalty (penalize large drawdowns)
        self.returns_history.append(pnl - trade_cost)
        recent_vol = (
            np.std(self.returns_history[-20:])
            if len(self.returns_history) >= 20
            else 0.01
        )
        risk_cost = self.risk_penalty * max(0, recent_vol - 0.02)

        # Total reward
        reward = pnl - trade_cost - risk_cost

        # Update state
        self.position = target_position
        self.portfolio_value *= (1 + pnl - trade_cost)
        self.current_step += 1
        done = self.current_step >= self.n_steps - 2

        return self._get_state(), reward, done


class DQNAgent:
    """DQN agent for trading."""

    def __init__(
        self,
        state_dim: int,
        n_actions: int = 3,
        lr: float = 1e-4,
        gamma: float = 0.99,
        epsilon_start: float = 1.0,
        epsilon_end: float = 0.01,
        epsilon_decay: int = 5000,
        buffer_size: int = 50000,
        batch_size: int = 64
    ):
        self.device = torch.device(
            'cuda' if torch.cuda.is_available() else 'cpu'
        )
        self.n_actions = n_actions
        self.gamma = gamma
        self.batch_size = batch_size

        # Epsilon greedy
        self.epsilon_start = epsilon_start
        self.epsilon_end = epsilon_end
        self.epsilon_decay = epsilon_decay
        self.steps_done = 0

        # Networks
        self.policy_net = DQNNetwork(state_dim, n_actions).to(self.device)
        self.target_net = DQNNetwork(state_dim, n_actions).to(self.device)
        self.target_net.load_state_dict(self.policy_net.state_dict())

        self.optimizer = optim.Adam(self.policy_net.parameters(), lr=lr)
        self.memory = deque(maxlen=buffer_size)

    def _get_epsilon(self) -> float:
        return self.epsilon_end + (self.epsilon_start - self.epsilon_end) * \
            np.exp(-self.steps_done / self.epsilon_decay)

    def select_action(self, state: np.ndarray) -> int:
        self.steps_done += 1
        if random.random() < self._get_epsilon():
            return random.randrange(self.n_actions)

        with torch.no_grad():
            state_t = torch.FloatTensor(state).unsqueeze(0).to(self.device)
            q_values = self.policy_net(state_t)
            return q_values.argmax(dim=1).item()

    def store_transition(
        self, state: np.ndarray, action: int,
        reward: float, next_state: np.ndarray, done: bool
    ):
        self.memory.append((state, action, reward, next_state, done))

    def train_step(self) -> float:
        if len(self.memory) < self.batch_size:
            return 0.0

        batch = random.sample(list(self.memory), self.batch_size)
        states, actions, rewards, next_states, dones = zip(*batch)

        states_t = torch.FloatTensor(np.array(states)).to(self.device)
        actions_t = torch.LongTensor(actions).to(self.device)
        rewards_t = torch.FloatTensor(rewards).to(self.device)
        next_states_t = torch.FloatTensor(np.array(next_states)).to(self.device)
        dones_t = torch.BoolTensor(dones).to(self.device)

        # Current Q values
        q_values = self.policy_net(states_t).gather(1, actions_t.unsqueeze(1))

        # Target Q values (Double DQN)
        with torch.no_grad():
            next_actions = self.policy_net(next_states_t).argmax(dim=1)
            next_q = self.target_net(next_states_t).gather(
                1, next_actions.unsqueeze(1)
            ).squeeze()
            next_q[dones_t] = 0.0
            target_q = rewards_t + self.gamma * next_q

        loss = nn.MSELoss()(q_values.squeeze(), target_q)
        self.optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(self.policy_net.parameters(), 1.0)
        self.optimizer.step()

        return loss.item()

    def update_target_network(self):
        self.target_net.load_state_dict(self.policy_net.state_dict())


def train_dqn_agent(
    env: TradingEnvironment, agent: DQNAgent,
    n_episodes: int = 200, target_update: int = 10
) -> list[float]:
    """Training loop for DQN trading agent."""
    episode_rewards = []

    for episode in range(n_episodes):
        state = env.reset()
        total_reward = 0.0

        while True:
            action = agent.select_action(state)
            next_state, reward, done = env.step(action)
            agent.store_transition(state, action, reward, next_state, done)

            loss = agent.train_step()
            total_reward += reward
            state = next_state

            if done:
                break

        if episode % target_update == 0:
            agent.update_target_network()

        episode_rewards.append(total_reward)

    return episode_rewards
```

---

## 11.6 NLP for Finance

### The NLP Alpha Landscape

```
NLP DATA SOURCES FOR ALPHA

  +--------------------+------------------+---------------------+
  | Source             | Latency          | Alpha Decay         |
  +--------------------+------------------+---------------------+
  | Breaking news      | Seconds          | Minutes             |
  | Earnings calls     | Real-time        | Hours to days       |
  | SEC filings        | Filed timestamp  | Days to weeks       |
  | Analyst reports    | Publication      | Days                |
  | Social media       | Real-time        | Minutes to hours    |
  | Patent filings     | Publication      | Weeks to months     |
  | Job postings       | Posted           | Weeks               |
  | Product reviews    | Ongoing          | Weeks to months     |
  +--------------------+------------------+---------------------+

  Speed of processing is critical: the first to extract
  signal from an earnings call transcript wins.
```

### Sentiment Analysis Pipeline

```python
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch
import pandas as pd

class FinancialSentimentAnalyzer:
    """Sentiment analysis using FinBERT."""

    def __init__(self, model_name: str = "ProsusAI/finbert"):
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_name)
        self.model.eval()
        self.labels = ['positive', 'negative', 'neutral']

    def analyze(self, text: str) -> dict:
        """Analyze sentiment of a single text."""
        inputs = self.tokenizer(
            text, return_tensors="pt",
            truncation=True, max_length=512
        )

        with torch.no_grad():
            outputs = self.model(**inputs)
            probs = torch.softmax(outputs.logits, dim=1)[0]

        sentiment_scores = {
            label: probs[i].item() for i, label in enumerate(self.labels)
        }
        # Net sentiment: positive - negative
        sentiment_scores['net_sentiment'] = (
            sentiment_scores['positive'] - sentiment_scores['negative']
        )
        return sentiment_scores

    def analyze_batch(self, texts: list[str]) -> pd.DataFrame:
        """Analyze sentiment for a batch of texts."""
        results = [self.analyze(text) for text in texts]
        return pd.DataFrame(results)


# Usage
analyzer = FinancialSentimentAnalyzer()

headlines = [
    "Apple reports record quarterly revenue beating estimates",
    "Federal Reserve signals aggressive rate hikes ahead",
    "Company announces massive layoffs amid restructuring",
    "Earnings in line with analyst expectations",
]

# results = analyzer.analyze_batch(headlines)
```

### Earnings Call Analysis

```python
def extract_earnings_features(transcript: str) -> dict:
    """Extract quantitative features from an earnings call transcript."""
    import re

    sections = {
        'prepared': '',
        'qa': ''
    }

    # Split into prepared remarks vs Q&A
    qa_markers = ['question-and-answer', 'q&a session', 'operator']
    lower = transcript.lower()
    for marker in qa_markers:
        idx = lower.find(marker)
        if idx > 0:
            sections['prepared'] = transcript[:idx]
            sections['qa'] = transcript[idx:]
            break

    # Quantitative features
    features = {}

    # Word count ratio (longer Q&A = more uncertainty)
    prep_words = len(sections['prepared'].split())
    qa_words = len(sections['qa'].split())
    features['qa_to_prep_ratio'] = (
        qa_words / max(prep_words, 1)
    )

    # Uncertainty language
    uncertainty_words = [
        'uncertain', 'risk', 'challenge', 'difficult', 'headwind',
        'cautious', 'volatile', 'concerned', 'worried', 'unclear'
    ]
    words_lower = transcript.lower().split()
    total_words = len(words_lower)
    features['uncertainty_density'] = sum(
        1 for w in words_lower if w in uncertainty_words
    ) / max(total_words, 1) * 1000  # per 1000 words

    # Positive language
    positive_words = [
        'growth', 'strong', 'record', 'exceeded', 'momentum',
        'confident', 'optimistic', 'robust', 'outperform', 'accelerat'
    ]
    features['positive_density'] = sum(
        1 for w in words_lower if any(w.startswith(p) for p in positive_words)
    ) / max(total_words, 1) * 1000

    # Numeric mentions (more precise = more confident)
    numbers = re.findall(r'\b\d+\.?\d*%?\b', transcript)
    features['number_density'] = len(numbers) / max(total_words, 1) * 1000

    # Forward-looking statements
    forward_words = [
        'expect', 'anticipate', 'forecast', 'guidance', 'outlook',
        'project', 'target', 'plan', 'intend', 'believe'
    ]
    features['forward_looking_density'] = sum(
        1 for w in words_lower if any(w.startswith(f) for f in forward_words)
    ) / max(total_words, 1) * 1000

    # Sentiment shift (prepared vs Q&A)
    # Would use FinBERT here in production

    return features
```

### LLMs for Financial Analysis

Large language models bring a new paradigm: zero-shot and few-shot reasoning about financial text.

```python
def llm_financial_analysis(text: str, api_client) -> dict:
    """
    Use an LLM for structured financial text analysis.
    api_client: any OpenAI-compatible client
    """
    prompt = f"""Analyze the following financial text and return a JSON object with:
1. sentiment: float from -1 (very negative) to +1 (very positive)
2. key_topics: list of 3-5 main topics discussed
3. forward_guidance: "positive", "neutral", or "negative"
4. risk_factors: list of mentioned risks
5. surprise_factor: float from 0 (no surprise) to 1 (major surprise)

Text: {text[:3000]}

Return ONLY valid JSON."""

    response = api_client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0,
        response_format={"type": "json_object"}
    )

    import json
    return json.loads(response.choices[0].message.content)
```

---

## 11.7 Cross-Validation for Time Series

### Why Standard K-Fold Fails

```
STANDARD K-FOLD: ILLEGAL FOR TIME SERIES

  Standard 5-Fold:
  Fold 1: [TEST] [train] [train] [train] [train]
  Fold 2: [train] [TEST] [train] [train] [train]
  Fold 3: [train] [train] [TEST] [train] [train]  <-- FUTURE LEAK!
  Fold 4: [train] [train] [train] [TEST] [train]  <-- FUTURE LEAK!
  Fold 5: [train] [train] [train] [train] [TEST]

  Problem: Folds 3+ train on FUTURE data to predict PAST.
  Serial correlation means adjacent data points are not independent.
  Result: Massively inflated performance estimates.
```

### Walk-Forward Validation

```
WALK-FORWARD (Expanding Window):

  Split 1: [=====TRAIN=====][TEST]
  Split 2: [========TRAIN========][TEST]
  Split 3: [===========TRAIN===========][TEST]
  Split 4: [==============TRAIN==============][TEST]

  + Mimics real deployment
  + No future leakage
  - Few test periods
  - Early splits have little training data

WALK-FORWARD (Rolling Window):

  Split 1: [=====TRAIN=====][TEST]
  Split 2:    [=====TRAIN=====][TEST]
  Split 3:       [=====TRAIN=====][TEST]
  Split 4:          [=====TRAIN=====][TEST]

  + Fixed training window = handles non-stationarity
  + More test periods
  - Discards old data that might be useful
```

### Purged K-Fold Cross-Validation

```
PURGED K-FOLD WITH EMBARGO

  The problem: overlapping labels create leakage between folds

  If target = 5-day forward return:

  Day:  1  2  3  4  5  6  7  8  9  10 11 12
        [----label 1----]
           [----label 2----]
              [----label 3----]
                 [----label 4----]

  Labels 1-4 share overlapping information!

  Solution: PURGE + EMBARGO

  Train:  [====TRAIN====]~~PURGE~~[..EMBARGO..][==TEST==][..EMBARGO..]~~PURGE~~[====TRAIN====]

  Purge:  Remove training samples whose labels overlap with test period
  Embargo: Additional gap after test period to prevent leakage from
           serial correlation
```

```python
import numpy as np
import pandas as pd
from typing import Generator

class PurgedKFoldCV:
    """
    Purged K-Fold Cross-Validation for financial time series.
    Based on Lopez de Prado's methodology.
    """

    def __init__(
        self,
        n_splits: int = 5,
        embargo_pct: float = 0.01
    ):
        self.n_splits = n_splits
        self.embargo_pct = embargo_pct

    def split(
        self,
        X: pd.DataFrame,
        y: pd.Series = None,
        pred_times: pd.Series = None,
        eval_times: pd.Series = None
    ) -> Generator[tuple[np.ndarray, np.ndarray], None, None]:
        """
        Generate purged train/test indices.

        pred_times: Series mapping each observation to its prediction time
        eval_times: Series mapping each observation to when its label is resolved
        """
        n_samples = len(X)
        indices = np.arange(n_samples)
        fold_size = n_samples // self.n_splits
        embargo_size = int(n_samples * self.embargo_pct)

        for i in range(self.n_splits):
            test_start = i * fold_size
            test_end = min((i + 1) * fold_size, n_samples)
            test_indices = indices[test_start:test_end]

            # Start with all non-test indices
            train_mask = np.ones(n_samples, dtype=bool)
            train_mask[test_start:test_end] = False

            # Purge: remove training samples with overlapping labels
            if pred_times is not None and eval_times is not None:
                test_start_time = pred_times.iloc[test_start]
                test_end_time = eval_times.iloc[test_end - 1]

                for j in range(n_samples):
                    if j in test_indices:
                        continue
                    # If this training sample's label overlaps test period
                    if (eval_times.iloc[j] >= test_start_time and
                            pred_times.iloc[j] <= test_end_time):
                        train_mask[j] = False

            # Embargo: remove samples right after test set
            embargo_end = min(test_end + embargo_size, n_samples)
            train_mask[test_end:embargo_end] = False

            train_indices = indices[train_mask]
            yield train_indices, test_indices


class WalkForwardCV:
    """Walk-forward cross-validation with expanding or rolling window."""

    def __init__(
        self,
        n_splits: int = 5,
        min_train_size: int = 252,
        max_train_size: int = None,     # None = expanding window
        embargo: int = 5
    ):
        self.n_splits = n_splits
        self.min_train_size = min_train_size
        self.max_train_size = max_train_size
        self.embargo = embargo

    def split(
        self, X: pd.DataFrame
    ) -> Generator[tuple[np.ndarray, np.ndarray], None, None]:
        n_samples = len(X)
        test_size = (n_samples - self.min_train_size) // (self.n_splits + 1)

        for i in range(self.n_splits):
            test_start = self.min_train_size + i * test_size + self.embargo
            test_end = test_start + test_size

            if test_end > n_samples:
                break

            train_start = 0
            if self.max_train_size is not None:
                train_start = max(0, test_start - self.embargo - self.max_train_size)

            train_end = test_start - self.embargo

            train_idx = np.arange(train_start, train_end)
            test_idx = np.arange(test_start, test_end)

            yield train_idx, test_idx


# Combinatorial Purged Cross-Validation (CPCV)
class CPCV:
    """
    Combinatorial Purged Cross-Validation.
    Tests all combinations of N groups taken k at a time as test sets.
    Produces more backtest paths than standard k-fold.
    """

    def __init__(self, n_groups: int = 6, n_test_groups: int = 2,
                 embargo_pct: float = 0.01):
        self.n_groups = n_groups
        self.n_test_groups = n_test_groups
        self.embargo_pct = embargo_pct

    def split(self, X: pd.DataFrame):
        from itertools import combinations

        n_samples = len(X)
        group_size = n_samples // self.n_groups
        embargo_size = int(n_samples * self.embargo_pct)

        # All combinations of test groups
        for test_groups in combinations(range(self.n_groups), self.n_test_groups):
            test_indices = []
            purge_indices = set()

            for g in test_groups:
                start = g * group_size
                end = min((g + 1) * group_size, n_samples)
                test_indices.extend(range(start, end))

                # Embargo zone after each test group
                embargo_end = min(end + embargo_size, n_samples)
                purge_indices.update(range(end, embargo_end))

                # Purge zone before each test group
                purge_start = max(start - embargo_size, 0)
                purge_indices.update(range(purge_start, start))

            test_set = set(test_indices)
            train_indices = [
                i for i in range(n_samples)
                if i not in test_set and i not in purge_indices
            ]

            yield np.array(train_indices), np.array(test_indices)
```

### Cross-Validation Evaluation

```python
def evaluate_with_purged_cv(
    model_factory,
    X: pd.DataFrame,
    y: pd.Series,
    n_splits: int = 5
) -> dict:
    """Evaluate a model using purged k-fold CV."""
    cv = PurgedKFoldCV(n_splits=n_splits, embargo_pct=0.02)

    oos_predictions = pd.Series(index=X.index, dtype=float)
    fold_metrics = []

    for fold, (train_idx, test_idx) in enumerate(cv.split(X, y)):
        X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
        y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]

        model = model_factory()
        model.fit(X_train, y_train)
        pred = model.predict(X_test)

        oos_predictions.iloc[test_idx] = pred

        ic = np.corrcoef(pred, y_test)[0, 1]
        fold_metrics.append({'fold': fold, 'ic': ic, 'n_test': len(test_idx)})

    valid_mask = oos_predictions.notna()
    overall_ic = np.corrcoef(
        oos_predictions[valid_mask], y[valid_mask]
    )[0, 1]

    return {
        'overall_ic': overall_ic,
        'fold_metrics': pd.DataFrame(fold_metrics),
        'mean_ic': np.mean([m['ic'] for m in fold_metrics]),
        'std_ic': np.std([m['ic'] for m in fold_metrics]),
        'oos_predictions': oos_predictions
    }
```

---

## 11.8 Ensemble Methods and Meta-Labeling

### Ensemble Architecture

```
ENSEMBLE METHODS FOR ALPHA

  Level 1: Base Models (diverse, independent)
  +----------+  +-----------+  +--------+  +---------+
  | Ridge    |  | XGBoost   |  | LSTM   |  | Random  |
  | Regr.    |  | (depth=4) |  | (seq)  |  | Forest  |
  +----+-----+  +-----+-----+  +---+----+  +----+----+
       |              |             |            |
       v              v             v            v
  +---------+   +---------+   +---------+  +---------+
  | pred_1  |   | pred_2  |   | pred_3  |  | pred_4  |
  +---------+   +---------+   +---------+  +---------+
       |              |             |            |
       +------+-------+------+------+            |
              |              |                   |
              v              v                   v
  Level 2: Meta-Learner (combines predictions)
  +--------------------------------------------------+
  | Stacking model (Ridge or simple average)          |
  | Input: base model predictions + original features |
  | Output: final alpha score                         |
  +--------------------------------------------------+
```

### Stacking Implementation

```python
from sklearn.base import BaseEstimator, RegressorMixin
from sklearn.linear_model import Ridge

class StackedAlphaModel(BaseEstimator, RegressorMixin):
    """Stacked ensemble for alpha prediction."""

    def __init__(self, base_models: list, meta_model=None, n_cv_folds: int = 5):
        self.base_models = base_models
        self.meta_model = meta_model or Ridge(alpha=10.0)
        self.n_cv_folds = n_cv_folds
        self.fitted_base_models: list = []

    def fit(self, X: pd.DataFrame, y: pd.Series):
        """Fit using out-of-fold predictions to avoid leakage."""
        n = len(X)
        meta_features = np.zeros((n, len(self.base_models)))

        cv = WalkForwardCV(n_splits=self.n_cv_folds)

        # Generate OOF predictions for meta-learner training
        for model_idx, model_factory in enumerate(self.base_models):
            for train_idx, val_idx in cv.split(X):
                model = model_factory()
                model.fit(X.iloc[train_idx], y.iloc[train_idx])
                meta_features[val_idx, model_idx] = model.predict(X.iloc[val_idx])

        # Fit meta-learner on OOF predictions
        valid_mask = meta_features.any(axis=1)
        self.meta_model.fit(meta_features[valid_mask], y.values[valid_mask])

        # Refit base models on all data for inference
        self.fitted_base_models = []
        for model_factory in self.base_models:
            model = model_factory()
            model.fit(X, y)
            self.fitted_base_models.append(model)

        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        meta_features = np.column_stack([
            model.predict(X) for model in self.fitted_base_models
        ])
        return self.meta_model.predict(meta_features)
```

### Meta-Labeling for Position Sizing

Meta-labeling is a two-model approach: the primary model decides direction, the secondary model decides whether to bet and how much.

```
META-LABELING FRAMEWORK

  Primary Model (Direction)         Meta Model (Sizing)
  +-----------------------+         +---------------------+
  | Input: Features       |         | Input: Features +   |
  | Output: {Buy, Sell}   |-------->| primary model pred  |
  | Goal: High recall     |         | Output: [0, 1]      |
  | (catch all signals)   |         | Goal: High precision|
  +-----------------------+         | (filter false pos)  |
                                    +---------------------+
                                            |
                                            v
                                    Final position =
                                    direction * size * confidence
```

```python
class MetaLabelingModel:
    """
    Meta-labeling: use a secondary model to size positions
    from a primary directional model.
    """

    def __init__(self, primary_model, meta_model=None):
        self.primary_model = primary_model
        self.meta_model = meta_model  # typically XGBoost classifier

    def create_meta_labels(
        self, X: pd.DataFrame, y_true: pd.Series, primary_pred: pd.Series
    ) -> pd.Series:
        """
        Meta-label: 1 if primary model's prediction was correct, 0 otherwise.
        """
        # Primary model says buy (1) or sell (0)
        # Meta-label: was the primary model right?
        correct = (
            (primary_pred > 0.5).astype(int) == (y_true > 0).astype(int)
        )
        return correct.astype(int)

    def fit(self, X: pd.DataFrame, y: pd.Series):
        """Fit both primary and meta models."""
        # Fit primary model
        self.primary_model.fit(X, (y > 0).astype(int))
        primary_pred = self.primary_model.predict_proba(X)[:, 1]

        # Create meta-labels
        meta_labels = self.create_meta_labels(
            X, y, pd.Series(primary_pred, index=X.index)
        )

        # Fit meta-model with primary predictions as additional feature
        X_meta = X.copy()
        X_meta['primary_pred'] = primary_pred
        self.meta_model.fit(X_meta, meta_labels)

        return self

    def predict(self, X: pd.DataFrame) -> pd.DataFrame:
        """Generate direction and confidence."""
        primary_pred = self.primary_model.predict_proba(X)[:, 1]

        X_meta = X.copy()
        X_meta['primary_pred'] = primary_pred
        confidence = self.meta_model.predict_proba(X_meta)[:, 1]

        # Direction from primary, size from meta
        direction = np.where(primary_pred > 0.5, 1, -1)
        position_size = confidence  # scale by meta-model confidence

        return pd.DataFrame({
            'direction': direction,
            'confidence': confidence,
            'position': direction * position_size
        }, index=X.index)
```

### Feature Importance Methods

```python
def mean_decrease_impurity(model, feature_names: list[str]) -> pd.Series:
    """MDI: built-in feature importance from tree models."""
    # Available directly from sklearn tree models
    importance = pd.Series(
        model.feature_importances_, index=feature_names
    ).sort_values(ascending=False)
    return importance


def mean_decrease_accuracy(
    model, X: pd.DataFrame, y: pd.Series, n_repeats: int = 5
) -> pd.Series:
    """MDA: permutation importance -- more reliable than MDI."""
    from sklearn.inspection import permutation_importance

    result = permutation_importance(
        model, X, y, n_repeats=n_repeats, scoring='r2'
    )
    importance = pd.Series(
        result.importances_mean, index=X.columns
    ).sort_values(ascending=False)
    return importance


def single_feature_importance(
    model_factory, X: pd.DataFrame, y: pd.Series,
    cv_splitter
) -> pd.Series:
    """SFI: train model on each feature individually."""
    scores = {}

    for col in X.columns:
        fold_scores = []
        for train_idx, test_idx in cv_splitter.split(X):
            model = model_factory()
            model.fit(X.iloc[train_idx][[col]], y.iloc[train_idx])
            pred = model.predict(X.iloc[test_idx][[col]])
            ic = np.corrcoef(pred, y.iloc[test_idx])[0, 1]
            fold_scores.append(ic)
        scores[col] = np.mean(fold_scores)

    return pd.Series(scores).sort_values(ascending=False)
```

---

## 11.9 Alternative Data

### Alternative Data Landscape

```
ALTERNATIVE DATA TAXONOMY

+--------------------------------------------------------------------+
| Category          | Examples              | Alpha Source            |
+--------------------------------------------------------------------+
| Satellite/Geo     | Parking lot counts,   | Retail sales before    |
|                   | oil tank fill levels, | earnings; supply chain |
|                   | crop health imagery   | disruptions            |
+--------------------------------------------------------------------+
| Transaction       | Credit card spending, | Revenue estimates,     |
|                   | point-of-sale data    | consumer trends        |
+--------------------------------------------------------------------+
| Web/App           | Web traffic, app      | User growth, product   |
|                   | downloads, job posts  | adoption, hiring plans |
+--------------------------------------------------------------------+
| Social/Sentiment  | Twitter, Reddit,      | Retail sentiment,      |
|                   | StockTwits, blogs     | meme stocks, fear      |
+--------------------------------------------------------------------+
| Government/Reg    | Patents, FDA filings, | Drug approvals, IP     |
|                   | EPA reports           | competitive advantage  |
+--------------------------------------------------------------------+
| Supply Chain      | Shipping/AIS data,    | Trade flow changes,    |
|                   | port activity, freight| supply shortages       |
+--------------------------------------------------------------------+
| Weather/Climate   | Weather forecasts,    | Agricultural yields,   |
|                   | disaster data         | energy demand          |
+--------------------------------------------------------------------+

  Key considerations:
  - Cost: $10K/yr (web scraping) to $1M+/yr (satellite)
  - Exclusivity: Does everyone have this data?
  - Latency: Real-time vs daily vs weekly
  - Coverage: Universe of stocks covered
  - History: Enough backtest data available?
```

### Web Scraping for Alpha

```python
import requests
from bs4 import BeautifulSoup
from datetime import datetime
import pandas as pd
import time

class JobPostingScraper:
    """
    Track company hiring trends as a leading indicator.
    More hiring = company expects growth.

    NOTE: Always respect robots.txt and terms of service.
    Use official APIs when available.
    """

    def __init__(self, rate_limit_seconds: float = 2.0):
        self.rate_limit = rate_limit_seconds
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Research Bot (academic use)'
        })

    def count_job_listings(self, company_careers_url: str) -> dict:
        """Count job listings from a company careers page."""
        try:
            time.sleep(self.rate_limit)
            response = self.session.get(company_careers_url, timeout=10)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, 'html.parser')

            # Generic heuristic -- real implementation would be company-specific
            job_elements = soup.find_all(
                ['div', 'li', 'tr'],
                class_=lambda c: c and any(
                    kw in str(c).lower()
                    for kw in ['job', 'position', 'opening', 'role']
                )
            )

            return {
                'timestamp': datetime.utcnow().isoformat(),
                'url': company_careers_url,
                'job_count': len(job_elements),
                'status': 'success'
            }
        except requests.RequestException as e:
            return {
                'timestamp': datetime.utcnow().isoformat(),
                'url': company_careers_url,
                'job_count': 0,
                'status': f'error: {str(e)}'
            }

    def build_hiring_trend(
        self, historical_counts: list[dict]
    ) -> pd.DataFrame:
        """Convert historical job counts into trading features."""
        df = pd.DataFrame(historical_counts)
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df = df.set_index('timestamp').sort_index()

        features = pd.DataFrame(index=df.index)
        features['job_count'] = df['job_count']
        features['job_count_ma_4w'] = df['job_count'].rolling(4).mean()
        features['job_count_change_4w'] = df['job_count'].pct_change(4)

        # Z-score: how unusual is current hiring?
        features['job_count_zscore'] = (
            (df['job_count'] - df['job_count'].rolling(12).mean())
            / df['job_count'].rolling(12).std()
        )

        return features
```

### Satellite Data Processing

```python
def process_parking_lot_data(
    daily_counts: pd.DataFrame,
    ticker_store_mapping: dict
) -> pd.DataFrame:
    """
    Convert parking lot vehicle counts (from satellite imagery)
    into stock-level features.

    daily_counts: DataFrame with columns [date, store_id, vehicle_count]
    ticker_store_mapping: dict mapping ticker -> list of store_ids
    """
    features_by_ticker = {}

    for ticker, store_ids in ticker_store_mapping.items():
        # Filter to this company's stores
        company_data = daily_counts[
            daily_counts['store_id'].isin(store_ids)
        ].copy()

        # Aggregate across stores
        daily_agg = (
            company_data
            .groupby('date')['vehicle_count']
            .agg(['mean', 'sum', 'count'])
        )

        # Create features
        ticker_feats = pd.DataFrame(index=daily_agg.index)
        ticker_feats['avg_traffic'] = daily_agg['mean']
        ticker_feats['total_traffic'] = daily_agg['sum']
        ticker_feats['stores_observed'] = daily_agg['count']

        # Year-over-year change (critical for seasonal businesses)
        ticker_feats['traffic_yoy'] = (
            ticker_feats['avg_traffic'].pct_change(252)
        )

        # Trend: is traffic accelerating or decelerating?
        ticker_feats['traffic_trend'] = (
            ticker_feats['avg_traffic'].rolling(21).mean()
            - ticker_feats['avg_traffic'].rolling(63).mean()
        )

        features_by_ticker[ticker] = ticker_feats

    return features_by_ticker
```

---

## 11.10 Pitfalls and Best Practices

### The Overfitting Taxonomy

```
OVERFITTING IN QUANTITATIVE FINANCE

  Type 1: IN-SAMPLE OVERFITTING
  +----------------------------------------------+
  | Too many parameters for the data available.   |
  | Detection: Large gap between IS and OOS perf. |
  | Fix: Regularization, fewer features, more data|
  +----------------------------------------------+

  Type 2: BACKTEST OVERFITTING
  +----------------------------------------------+
  | Running too many backtests on the same data.  |
  | Even with proper CV, testing 1000 strategies  |
  | guarantees some will look good by chance.     |
  | Detection: Deflated Sharpe ratio              |
  | Fix: Hold out a final test set, adjust for    |
  |      multiple testing                         |
  +----------------------------------------------+

  Type 3: SELECTION BIAS
  +----------------------------------------------+
  | Choosing the best strategy from many tested.  |
  | "We tested 50 models and this one works!"     |
  | Detection: Track ALL strategies tested        |
  | Fix: Bonferroni correction, family-wise error |
  +----------------------------------------------+

  Type 4: REGIME OVERFITTING
  +----------------------------------------------+
  | Model works in current regime but fails when  |
  | regime changes (which it always does).        |
  | Detection: Test across multiple regimes       |
  | Fix: Regime-conditional models, ensemble      |
  +----------------------------------------------+
```

### Deflated Sharpe Ratio

The Deflated Sharpe Ratio accounts for the fact that you tested many strategies before finding "the one."

```python
from scipy.stats import norm

def deflated_sharpe_ratio(
    sharpe_observed: float,
    n_trials: int,
    n_observations: int,
    skewness: float = 0.0,
    kurtosis: float = 3.0,
    sharpe_benchmark: float = 0.0
) -> float:
    """
    Calculate the probability that the observed Sharpe ratio is
    genuine, accounting for multiple testing.

    Based on Bailey & Lopez de Prado (2014).

    sharpe_observed: the Sharpe ratio of your best strategy
    n_trials: number of strategies you tested
    n_observations: number of data points
    skewness: skewness of returns
    kurtosis: kurtosis of returns (3 = normal)
    sharpe_benchmark: expected Sharpe under null (usually 0)
    """
    # Expected max Sharpe from n_trials under null
    e_max_sharpe = sharpe_benchmark + np.sqrt(2 * np.log(n_trials)) * (
        1 - np.euler_gamma / np.sqrt(2 * np.log(n_trials))
    )

    # Standard error of Sharpe ratio (accounting for non-normality)
    se_sharpe = np.sqrt(
        (1 + 0.5 * sharpe_observed**2
         - skewness * sharpe_observed
         + ((kurtosis - 3) / 4) * sharpe_observed**2)
        / (n_observations - 1)
    )

    # Probability that observed Sharpe is genuine
    z = (sharpe_observed - e_max_sharpe) / se_sharpe
    p_value = norm.cdf(z)

    return p_value

# Example: You tested 100 strategies and found one with Sharpe = 2.0
dsr = deflated_sharpe_ratio(
    sharpe_observed=2.0,
    n_trials=100,
    n_observations=252 * 5,  # 5 years of daily data
)
# dsr might be only 0.35 -- a 35% chance the Sharpe is genuine!
# A Sharpe of 2.0 sounds great until you account for multiple testing.
```

### Feature Leakage Detection

```python
def detect_feature_leakage(
    X: pd.DataFrame, y: pd.Series, threshold: float = 0.5
) -> list[str]:
    """
    Detect features that might have look-ahead bias.
    Features with suspiciously high correlation to future returns
    are likely leaking information from the future.
    """
    suspicious_features = []

    for col in X.columns:
        valid_mask = X[col].notna() & y.notna()
        if valid_mask.sum() < 100:
            continue

        corr = np.corrcoef(X[col][valid_mask], y[valid_mask])[0, 1]

        if abs(corr) > threshold:
            suspicious_features.append({
                'feature': col,
                'correlation': corr,
                'verdict': 'LIKELY LEAKAGE'
            })
        elif abs(corr) > 0.1:
            suspicious_features.append({
                'feature': col,
                'correlation': corr,
                'verdict': 'INVESTIGATE'
            })

    # Also check: features that are "too good" on a simple model
    # Real alpha features have IC ~0.02-0.05, not 0.3+

    return suspicious_features


def check_timestamp_alignment(
    features_df: pd.DataFrame,
    target_series: pd.Series
) -> dict:
    """
    Verify that features are properly lagged relative to targets.
    """
    issues = []

    # Check: can we predict today's target with today's features?
    # If same-day correlation is very high, features might use
    # information from after the market close.
    for col in features_df.columns:
        valid = features_df[col].notna() & target_series.notna()
        if valid.sum() < 100:
            continue

        same_day_corr = np.corrcoef(
            features_df[col][valid], target_series[valid]
        )[0, 1]

        lagged_corr = np.corrcoef(
            features_df[col].shift(1)[valid], target_series[valid]
        )[0, 1]

        if abs(same_day_corr) > 2 * abs(lagged_corr) and abs(same_day_corr) > 0.05:
            issues.append({
                'feature': col,
                'same_day_corr': same_day_corr,
                'lagged_corr': lagged_corr,
                'issue': 'Possible look-ahead bias'
            })

    return {
        'issues': issues,
        'n_issues': len(issues),
        'clean': len(issues) == 0
    }
```

### Model Monitoring in Production

```python
class AlphaModelMonitor:
    """Monitor a deployed alpha model for degradation."""

    def __init__(self, lookback_window: int = 63):
        self.lookback = lookback_window
        self.history: list[dict] = []

    def record(self, date, prediction: float, actual: float):
        self.history.append({
            'date': date,
            'prediction': prediction,
            'actual': actual
        })

    def get_diagnostics(self) -> dict:
        """Calculate live monitoring metrics."""
        if len(self.history) < self.lookback:
            return {'status': 'insufficient_data'}

        recent = self.history[-self.lookback:]
        preds = np.array([h['prediction'] for h in recent])
        actuals = np.array([h['actual'] for h in recent])

        # Information Coefficient (rolling)
        ic = np.corrcoef(preds, actuals)[0, 1]

        # IC decay: compare recent IC to historical IC
        if len(self.history) >= 2 * self.lookback:
            older = self.history[-2 * self.lookback:-self.lookback]
            old_preds = np.array([h['prediction'] for h in older])
            old_actuals = np.array([h['actual'] for h in older])
            old_ic = np.corrcoef(old_preds, old_actuals)[0, 1]
            ic_decay = ic - old_ic
        else:
            old_ic = ic
            ic_decay = 0.0

        # Prediction distribution shift
        pred_mean = np.mean(preds)
        pred_std = np.std(preds)

        # Hit rate
        correct = np.sum(np.sign(preds) == np.sign(actuals))
        hit_rate = correct / len(preds)

        # Alerts
        alerts = []
        if abs(ic) < 0.01:
            alerts.append('CRITICAL: IC near zero -- model may be dead')
        if ic < 0:
            alerts.append('WARNING: Negative IC -- model is anti-predictive')
        if ic_decay < -0.02:
            alerts.append('WARNING: IC declining -- possible regime change')
        if hit_rate < 0.48:
            alerts.append('WARNING: Hit rate below 48%')
        if pred_std < 0.001:
            alerts.append('WARNING: Predictions have near-zero variance')

        return {
            'status': 'degraded' if alerts else 'healthy',
            'ic': ic,
            'ic_previous': old_ic,
            'ic_decay': ic_decay,
            'hit_rate': hit_rate,
            'pred_mean': pred_mean,
            'pred_std': pred_std,
            'n_observations': len(recent),
            'alerts': alerts
        }
```

### Best Practices Checklist

```
ML FOR QUANT TRADING: BEST PRACTICES

  DATA
  [ ] Survivorship-bias-free data
  [ ] Point-in-time data (no future information)
  [ ] Sufficient history (5+ years minimum)
  [ ] Corporate actions adjusted (splits, dividends)
  [ ] Multiple asset classes tested

  FEATURES
  [ ] All features lagged by at least 1 bar
  [ ] No features derived from future data
  [ ] Fractional differentiation considered
  [ ] Feature importance measured (MDA, not just MDI)
  [ ] Feature count < observations / 10

  MODELING
  [ ] Linear baseline established first
  [ ] Regularization applied (L1, L2, or both)
  [ ] Hyperparameters tuned on validation set (not test)
  [ ] Ensemble of diverse models preferred
  [ ] Early stopping on validation loss

  VALIDATION
  [ ] Time-series cross-validation (never random split)
  [ ] Purged k-fold or walk-forward CV used
  [ ] Embargo period between train and test
  [ ] Multiple test periods evaluated
  [ ] Deflated Sharpe ratio computed

  DEPLOYMENT
  [ ] Paper trading before live capital
  [ ] Model monitoring dashboard active
  [ ] IC, hit rate, and turnover tracked daily
  [ ] Automatic alerts for model degradation
  [ ] Kill switch for catastrophic drawdown

  MINDSET
  [ ] Assume every result is overfitting until proven otherwise
  [ ] Track ALL experiments (not just successes)
  [ ] An IC of 0.03 is good; 0.10+ is suspicious
  [ ] Simple models > complex models in most cases
  [ ] The model is never "done" -- markets evolve continuously
```

---

## Summary

```
CHAPTER 11 KEY TAKEAWAYS

  1. SIGNAL-TO-NOISE IS TERRIBLE
     Financial returns have SNR ~0.03. Expect ICs of 0.02-0.05.
     Anything higher is likely overfitting.

  2. FEATURE ENGINEERING > MODEL SELECTION
     80% of alpha comes from features, 20% from the model.
     Invest your time in domain-specific feature engineering.

  3. TREE MODELS WIN ON TABULAR DATA
     XGBoost/LightGBM with shallow trees, heavy regularization,
     and proper CV outperform deep learning on structured financial data.

  4. DEEP LEARNING SHINES ON UNSTRUCTURED DATA
     Use NLP models for text, CNNs for images, Transformers for
     sequences -- not for predicting returns from price features.

  5. CROSS-VALIDATION MUST RESPECT TIME
     Never use random splits. Always use purged k-fold,
     walk-forward, or CPCV with embargo.

  6. META-LABELING SEPARATES DIRECTION FROM SIZING
     Let one model predict direction (high recall),
     another model decide whether to bet (high precision).

  7. ALTERNATIVE DATA IS THE NEW FRONTIER
     Traditional price/volume features are crowded.
     Novel datasets provide temporary informational edges.

  8. OVERFITTING IS THE DEFAULT OUTCOME
     Without rigorous methodology, you WILL overfit.
     Use deflated Sharpe ratio. Track all experiments.
     Be deeply skeptical of your own results.

  9. MONITOR RELENTLESSLY IN PRODUCTION
     Models decay. Regimes change. Alpha erodes.
     Build monitoring systems before deployment.

  10. SIMPLICITY WINS
      A Ridge regression with 10 good features will
      beat a Transformer with 500 noisy features.
```

---

## Interview Questions

**Q: You built an XGBoost model with a Sharpe ratio of 3.0 in backtest. Your colleague says it is overfitted. How do you investigate?**

Check: (1) How many strategies were tested before this one? Compute the deflated Sharpe ratio. (2) Is the OOS performance close to IS? A large gap indicates overfitting. (3) Run purged k-fold CV -- is the Sharpe stable across folds? (4) Test on a completely held-out period (paper trade). (5) Check feature importance -- are a few features dominating? If so, verify they have no look-ahead bias. (6) Reduce model complexity (fewer features, shallower trees) and check if Sharpe degrades gracefully or collapses. A Sharpe of 3.0 on daily data is extremely high and should be treated with extreme skepticism.

**Q: Why would you use fractional differentiation instead of regular returns?**

Regular returns (d=1 differencing) remove all memory from the price series. Fractional differentiation (d~0.3-0.5) achieves stationarity while preserving significant memory of the price level. This memory contains information about support/resistance levels and long-term trends that pure returns discard. You find the minimum d that passes an ADF stationarity test.

**Q: When would you choose an LSTM over XGBoost for alpha modeling?**

Almost never for tabular features. LSTMs are appropriate when: (1) the data is inherently sequential and the temporal ordering within a window matters (e.g., order book dynamics, tick-by-tick data); (2) you have abundant training data (millions of samples); (3) the features are unstructured or very high-dimensional. For standard cross-sectional equity signals with ~50 features and ~5000 daily observations, XGBoost will almost always outperform.

**Q: Explain meta-labeling and why it is useful.**

Meta-labeling is a two-stage approach. The primary model makes directional predictions (buy/sell) with high recall -- it tries to catch every opportunity, accepting false positives. The secondary (meta) model takes the primary model's predictions plus additional features and predicts whether each prediction will be correct. This effectively sizes positions: high-confidence predictions get full size, low-confidence ones get reduced size or are skipped entirely. It separates "what direction" from "should we bet."

**Q: How does purged k-fold differ from standard walk-forward validation?**

Walk-forward uses a single expanding or rolling train window with a single test window that advances through time. Purged k-fold divides data into k groups and rotates the test set like standard k-fold, but adds two safeguards: (1) purging removes any training sample whose label period overlaps with the test period, and (2) an embargo gap is added after the test set to prevent serial correlation leakage. Purged k-fold generates more test observations and better uncertainty estimates than walk-forward, while still preventing temporal leakage.
