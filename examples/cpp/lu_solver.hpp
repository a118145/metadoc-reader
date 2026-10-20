#pragma once

#include <cstddef>
#include <vector>

namespace linalg {

/// Dense square matrix in row-major order.
struct Matrix {
    std::size_t n = 0;
    std::vector<double> data;

    explicit Matrix(std::size_t size) : n(size), data(size * size, 0.0) {}
    double& operator()(std::size_t row, std::size_t col) { return data[row * n + col]; }
    double operator()(std::size_t row, std::size_t col) const { return data[row * n + col]; }
};

/// LU decomposition with partial pivoting: P A = L U, stored compactly.
class LuSolver {
public:
    explicit LuSolver(Matrix a);

    bool decompose();
    std::vector<double> solve(const std::vector<double>& b) const;
    double determinant() const;

private:
    Matrix lu_;
    std::vector<std::size_t> pivot_;
    int swaps_ = 0;
    bool singular_ = false;
};

}  // namespace linalg
