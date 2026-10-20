#include "lu_solver.hpp"

#include <cmath>
#include <stdexcept>
#include <utility>

namespace linalg {

namespace {
constexpr double kPivotTolerance = 1e-12;
}  // namespace

LuSolver::LuSolver(Matrix a) : lu_(std::move(a)), pivot_(lu_.n) {
    for (std::size_t i = 0; i < lu_.n; ++i) {
        pivot_[i] = i;
    }
}

bool LuSolver::decompose() {
    const std::size_t n = lu_.n;
    for (std::size_t k = 0; k < n; ++k) {
        // Partial pivoting: bring the largest remaining entry of column k to the diagonal.
        std::size_t best = k;
        for (std::size_t i = k + 1; i < n; ++i) {
            if (std::abs(lu_(i, k)) > std::abs(lu_(best, k))) {
                best = i;
            }
        }
        if (std::abs(lu_(best, k)) < kPivotTolerance) {
            singular_ = true;
            return false;
        }
        if (best != k) {
            for (std::size_t j = 0; j < n; ++j) {
                std::swap(lu_(k, j), lu_(best, j));
            }
            std::swap(pivot_[k], pivot_[best]);
            ++swaps_;
        }
        // Eliminate below the pivot; store the multipliers in place of the zeros (the L part).
        for (std::size_t i = k + 1; i < n; ++i) {
            lu_(i, k) /= lu_(k, k);
            for (std::size_t j = k + 1; j < n; ++j) {
                lu_(i, j) -= lu_(i, k) * lu_(k, j);
            }
        }
    }
    return true;
}

std::vector<double> LuSolver::solve(const std::vector<double>& b) const {
    if (singular_) {
        throw std::runtime_error("matrix is singular");
    }
    const std::size_t n = lu_.n;
    std::vector<double> x(n);
    // Forward substitution L y = P b (L has an implicit unit diagonal).
    for (std::size_t i = 0; i < n; ++i) {
        double sum = b[pivot_[i]];
        for (std::size_t j = 0; j < i; ++j) {
            sum -= lu_(i, j) * x[j];
        }
        x[i] = sum;
    }
    // Back substitution U x = y.
    for (std::size_t i = n; i-- > 0;) {
        double sum = x[i];
        for (std::size_t j = i + 1; j < n; ++j) {
            sum -= lu_(i, j) * x[j];
        }
        x[i] = sum / lu_(i, i);
    }
    return x;
}

double LuSolver::determinant() const {
    if (singular_) {
        return 0.0;
    }
    double det = (swaps_ % 2 == 0) ? 1.0 : -1.0;
    for (std::size_t i = 0; i < lu_.n; ++i) {
        det *= lu_(i, i);
    }
    return det;
}

}  // namespace linalg
