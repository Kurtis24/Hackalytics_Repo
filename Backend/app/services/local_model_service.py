"""
Local PyTorch model service — loads a trained checkpoint and runs
inference directly, bypassing the Databricks serving endpoint.
"""

from __future__ import annotations

import logging
import math
from typing import Any, Dict, List, Optional

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import pytorch_lightning as pl

from app.models.prediction import PredictionRequest

logger = logging.getLogger(__name__)

# ── Market type mapping (must match notebook cell 9) ──────────────────
MARKET_TYPE_MAP = {"MONEYLINE": 0, "POINTS_SPREAD": 1, "POINTS_TOTAL": 2}


# ══════════════════════════════════════════════════════════════════════
# Model classes — copied verbatim from the training notebook so that
# `load_from_checkpoint` can reconstruct the architecture.
# ══════════════════════════════════════════════════════════════════════

class ALiBiAttention(nn.Module):
    """Multi-head attention with ALiBi positional encoding."""

    def __init__(self, d_model: int, n_heads: int, dropout: float = 0.1):
        super().__init__()
        assert d_model % n_heads == 0
        self.d_model = d_model
        self.n_heads = n_heads
        self.head_dim = d_model // n_heads
        self.scale = self.head_dim ** -0.5

        self.q_proj = nn.Linear(d_model, d_model)
        self.k_proj = nn.Linear(d_model, d_model)
        self.v_proj = nn.Linear(d_model, d_model)
        self.out_proj = nn.Linear(d_model, d_model)
        self.dropout = nn.Dropout(dropout)

        slopes = self._compute_slopes(n_heads)
        self.register_buffer("slopes", slopes)

    @staticmethod
    def _compute_slopes(n_heads: int) -> torch.Tensor:
        def get_slopes_power_of_2(n):
            start = 2 ** (-(2 ** -(math.log2(n) - 3)))
            ratio = start
            return [start * (ratio ** i) for i in range(n)]

        if math.log2(n_heads).is_integer():
            return torch.tensor(get_slopes_power_of_2(n_heads), dtype=torch.float32)
        else:
            closest_power = 2 ** math.floor(math.log2(n_heads))
            slopes = get_slopes_power_of_2(closest_power)
            extra = get_slopes_power_of_2(2 * closest_power)[0::2][
                : n_heads - closest_power
            ]
            return torch.tensor(slopes + extra, dtype=torch.float32)

    def _alibi_bias(self, T: int) -> torch.Tensor:
        positions = torch.arange(T, device=self.slopes.device)
        distance = positions.unsqueeze(0) - positions.unsqueeze(1)
        bias = (
            self.slopes.unsqueeze(-1).unsqueeze(-1)
            * distance.unsqueeze(0).abs().neg()
        )
        return bias

    def forward(
        self,
        query: torch.Tensor,
        key: torch.Tensor,
        value: torch.Tensor,
        mask: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        B, T_q, _ = query.shape
        T_k = key.shape[1]

        Q = self.q_proj(query).view(B, T_q, self.n_heads, self.head_dim).transpose(1, 2)
        K = self.k_proj(key).view(B, T_k, self.n_heads, self.head_dim).transpose(1, 2)
        V = self.v_proj(value).view(B, T_k, self.n_heads, self.head_dim).transpose(1, 2)

        attn = (Q @ K.transpose(-2, -1)) * self.scale

        if T_q == T_k:
            attn = attn + self._alibi_bias(T_q).unsqueeze(0)

        if mask is not None:
            mask_expanded = mask.unsqueeze(1).unsqueeze(2)
            attn = attn.masked_fill(~mask_expanded, float("-inf"))

        attn = F.softmax(attn, dim=-1)
        attn = self.dropout(attn)

        out = (attn @ V).transpose(1, 2).contiguous().view(B, T_q, self.d_model)
        return self.out_proj(out)


class TransformerEncoderLayer(nn.Module):
    """Transformer encoder layer with optional cross-attention."""

    def __init__(
        self,
        d_model: int,
        n_heads: int,
        d_ff: int,
        dropout: float = 0.1,
        use_cross_attn: bool = False,
    ):
        super().__init__()
        self.self_attn = ALiBiAttention(d_model, n_heads, dropout)
        self.norm1 = nn.LayerNorm(d_model)

        self.use_cross_attn = use_cross_attn
        if use_cross_attn:
            self.cross_attn = ALiBiAttention(d_model, n_heads, dropout)
            self.norm_cross = nn.LayerNorm(d_model)

        self.ffn = nn.Sequential(
            nn.Linear(d_model, d_ff),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_ff, d_model),
            nn.Dropout(dropout),
        )
        self.norm2 = nn.LayerNorm(d_model)

    def forward(
        self,
        x: torch.Tensor,
        mask: Optional[torch.Tensor] = None,
        cross_kv: Optional[torch.Tensor] = None,
        cross_mask: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        residual = x
        x = self.norm1(x)
        x = residual + self.self_attn(x, x, x, mask)

        if self.use_cross_attn and cross_kv is not None:
            residual = x
            x = self.norm_cross(x)
            x = residual + self.cross_attn(x, cross_kv, cross_kv, cross_mask)

        residual = x
        x = self.norm2(x)
        x = residual + self.ffn(x)
        return x


class AttentionPooling(nn.Module):
    """Learnable attention-weighted pooling over the sequence dimension."""

    def __init__(self, d_model: int):
        super().__init__()
        self.query = nn.Parameter(torch.randn(1, 1, d_model))
        self.scale = d_model ** -0.5

    def forward(
        self, x: torch.Tensor, mask: Optional[torch.Tensor] = None
    ) -> torch.Tensor:
        scores = (self.query * x).sum(dim=-1) * self.scale
        if mask is not None:
            scores = scores.masked_fill(~mask, float("-inf"))
        weights = F.softmax(scores, dim=-1).unsqueeze(-1)
        return (weights * x).sum(dim=1)


class TemporalArbitrageScorer(nn.Module):
    """Dual-Stream Transformer Encoder with Cross-Attention."""

    def __init__(
        self,
        n_input_features: int = 10,
        d_model: int = 64,
        n_heads: int = 4,
        n_layers: int = 3,
        d_ff: int = 256,
        dropout: float = 0.1,
        n_market_types: int = 3,
        cross_attn_start_layer: int = 1,
    ):
        super().__init__()
        self.d_model = d_model
        self.n_input_features = n_input_features
        self.n_layers = n_layers
        self.n_heads = n_heads
        self.d_ff = d_ff
        self.dropout_rate = dropout

        self.proj_a = nn.Linear(n_input_features, d_model)
        self.proj_b = nn.Linear(n_input_features, d_model)

        self.market_emb = nn.Embedding(n_market_types, d_model)

        self.layers_a = nn.ModuleList(
            [
                TransformerEncoderLayer(
                    d_model,
                    n_heads,
                    d_ff,
                    dropout,
                    use_cross_attn=(i >= cross_attn_start_layer),
                )
                for i in range(n_layers)
            ]
        )
        self.layers_b = nn.ModuleList(
            [
                TransformerEncoderLayer(
                    d_model,
                    n_heads,
                    d_ff,
                    dropout,
                    use_cross_attn=(i >= cross_attn_start_layer),
                )
                for i in range(n_layers)
            ]
        )

        self.pool_a = AttentionPooling(d_model)
        self.pool_b = AttentionPooling(d_model)

        self.head = nn.Sequential(
            nn.Linear(d_model * 2 + d_model, d_ff),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_ff, d_ff // 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_ff // 2, 1),
        )

    def forward(
        self,
        features: torch.Tensor,
        mask: torch.Tensor,
        market_type: torch.Tensor,
    ) -> torch.Tensor:
        h_a = self.proj_a(features)
        h_b = self.proj_b(features)

        for layer_a, layer_b in zip(self.layers_a, self.layers_b):
            h_a_new = layer_a(h_a, mask=mask, cross_kv=h_b, cross_mask=mask)
            h_b_new = layer_b(h_b, mask=mask, cross_kv=h_a, cross_mask=mask)
            h_a, h_b = h_a_new, h_b_new

        pooled_a = self.pool_a(h_a, mask)
        pooled_b = self.pool_b(h_b, mask)

        m_emb = self.market_emb(market_type)

        combined = torch.cat([pooled_a, pooled_b, m_emb], dim=-1)
        score = torch.sigmoid(self.head(combined).squeeze(-1))
        return score

    def get_params(self) -> Dict[str, Any]:
        return {
            "n_input_features": self.n_input_features,
            "d_model": self.d_model,
            "n_heads": self.n_heads,
            "n_layers": self.n_layers,
            "d_ff": self.d_ff,
            "dropout": self.dropout_rate,
        }


class ArbitrageLightningModule(pl.LightningModule):
    """PyTorch Lightning wrapper for TemporalArbitrageScorer."""

    def __init__(
        self,
        n_input_features: int = 10,
        d_model: int = 64,
        n_heads: int = 4,
        n_layers: int = 3,
        d_ff: int = 256,
        dropout: float = 0.1,
        learning_rate: float = 1e-3,
        weight_decay: float = 1e-5,
        cross_attn_start_layer: int = 1,
    ):
        super().__init__()
        self.save_hyperparameters()

        self.model = TemporalArbitrageScorer(
            n_input_features=n_input_features,
            d_model=d_model,
            n_heads=n_heads,
            n_layers=n_layers,
            d_ff=d_ff,
            dropout=dropout,
            cross_attn_start_layer=cross_attn_start_layer,
        )
        self.loss_fn = nn.BCELoss()

    def forward(self, features, mask, market_type):
        return self.model(features, mask, market_type)

    def _shared_step(self, batch, stage: str):
        scores = self(batch["features"], batch["mask"], batch["market_type"])
        loss = self.loss_fn(scores, batch["label"])
        preds = (scores > 0.5).float()
        acc = (preds == batch["label"]).float().mean()
        self.log(f"{stage}_loss", loss, prog_bar=True, batch_size=len(batch["label"]))
        self.log(f"{stage}_acc", acc, prog_bar=True, batch_size=len(batch["label"]))
        return loss

    def training_step(self, batch, batch_idx):
        return self._shared_step(batch, "train")

    def validation_step(self, batch, batch_idx):
        return self._shared_step(batch, "val")

    def test_step(self, batch, batch_idx):
        return self._shared_step(batch, "test")

    def configure_optimizers(self):
        optimizer = torch.optim.AdamW(
            self.parameters(),
            lr=self.hparams.learning_rate,
            weight_decay=self.hparams.weight_decay,
        )
        scheduler = torch.optim.lr_scheduler.CosineAnnealingWarmRestarts(
            optimizer, T_0=10, T_mult=2
        )
        return {"optimizer": optimizer, "lr_scheduler": scheduler}

    def get_params(self) -> Dict[str, Any]:
        return self.model.get_params()


# ══════════════════════════════════════════════════════════════════════
# Feature engineering — mirrors notebook cell 9
# ══════════════════════════════════════════════════════════════════════

def engineer_features(odds_a: np.ndarray, odds_b: np.ndarray) -> np.ndarray:
    """Convert a pair of odds sequences into a (T, 10) feature matrix.

    All values are float64 to match the trained model's expected dtype.
    """
    odds_a = np.asarray(odds_a, dtype=np.float64)
    odds_b = np.asarray(odds_b, dtype=np.float64)
    T = len(odds_a)

    impl_a = 1.0 / odds_a
    impl_b = 1.0 / odds_b

    arb_indicator = impl_a + impl_b
    spread = odds_a - odds_b
    impl_diff = impl_a - impl_b

    delta_a = np.concatenate([[0.0], np.diff(odds_a)])
    delta_b = np.concatenate([[0.0], np.diff(odds_b)])

    rel_delta_a = delta_a / (odds_a + 1e-8)
    rel_delta_b = delta_b / (odds_b + 1e-8)

    time_pos = np.linspace(0.0, 1.0, T)

    features = np.stack(
        [
            odds_a,
            odds_b,
            spread,
            impl_diff,
            arb_indicator,
            delta_a,
            delta_b,
            rel_delta_a,
            rel_delta_b,
            time_pos,
        ],
        axis=1,
    )
    return features  # (T, 10), float64


# ══════════════════════════════════════════════════════════════════════
# Service class
# ══════════════════════════════════════════════════════════════════════

class LocalModelService:
    """Loads a trained .ckpt and exposes prediction helpers."""

    def __init__(self, checkpoint_path: str):
        logger.info("Loading model checkpoint from %s", checkpoint_path)
        self._module = ArbitrageLightningModule.load_from_checkpoint(
            checkpoint_path, map_location="cpu"
        )
        self._module.double().eval()
        logger.info("Model loaded and set to eval mode (float64)")

    # ── low-level predict ─────────────────────────────────────────────
    def predict(
        self,
        features: torch.Tensor,
        mask: torch.Tensor,
        market_type: torch.Tensor,
    ) -> torch.Tensor:
        """Run a forward pass with no gradient tracking.

        Args:
            features:    (B, T, 10) float64
            mask:        (B, T) bool
            market_type: (B,) long
        Returns:
            (B,) scores in [0, 1]
        """
        with torch.no_grad():
            return self._module(features, mask, market_type)

    # ── high-level: PredictionRequest → score dict ────────────────────
    def predict_from_request(self, req: PredictionRequest) -> dict:
        """Convert a PredictionRequest into a model score.

        The request's ``current_odds`` maps bookmaker names to lists of
        decimal-odds values.  We average across bookmakers into two
        pseudo-sequences (odds_a, odds_b) and treat them as a length-1
        time series (single snapshot).  For a richer signal, callers can
        later supply full historical sequences.
        """
        bookmakers = list(req.current_odds.keys())
        if len(bookmakers) < 2:
            return {"score": None, "error": "Need at least 2 bookmakers"}

        # Use first two bookmakers as the two sides
        odds_a_raw = np.array(req.current_odds[bookmakers[0]], dtype=np.float64)
        odds_b_raw = np.array(req.current_odds[bookmakers[1]], dtype=np.float64)

        # Average across outcomes per bookmaker to get a scalar per timestep
        odds_a_val = float(odds_a_raw.mean())
        odds_b_val = float(odds_b_raw.mean())

        # Build a single-timestep sequence
        odds_a_seq = np.array([odds_a_val], dtype=np.float64)
        odds_b_seq = np.array([odds_b_val], dtype=np.float64)

        features = engineer_features(odds_a_seq, odds_b_seq)  # (1, 10)

        # Tensors — batch size 1
        features_t = torch.tensor(features, dtype=torch.float64).unsqueeze(0)  # (1,1,10)
        mask_t = torch.ones(1, 1, dtype=torch.bool)  # (1, 1)

        market_str = (req.market_type or "MONEYLINE").upper()
        market_idx = MARKET_TYPE_MAP.get(market_str, 0)
        market_t = torch.tensor([market_idx], dtype=torch.long)  # (1,)

        score = self.predict(features_t, mask_t, market_t)

        return {
            "score": float(score.item()),
            "market_type": market_str,
            "bookmakers_used": bookmakers[:2],
        }
