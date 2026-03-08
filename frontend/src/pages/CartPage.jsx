import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Trash2, ShoppingBag } from 'lucide-react';

const CartPage = ({ user, logout, cart, removeFromCart, updateCartQuantity, settings }) => {
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} />

      <div className="container mx-auto px-4 py-12">
        <h1 className="text-4xl md:text-5xl font-bold text-white text-center mb-12" data-testid="cart-title">Shopping Cart</h1>

        {cart.length === 0 ? (
          <div className="text-center py-20" data-testid="empty-cart">
            <ShoppingBag className="mx-auto mb-6 text-white" size={80} />
            <h2 className="text-2xl text-white mb-4">Your cart is empty</h2>
            <Link to="/products">
              <Button className="bg-white text-green-600 hover:bg-gray-100" data-testid="continue-shopping-btn">
                Continue Shopping
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Cart Items */}
            <div className="lg:col-span-2 space-y-4" data-testid="cart-items">
              {cart.map((item) => (
                <Card key={item.product.id} className="glass-effect border-white/20" data-testid={`cart-item-${item.product.id}`}>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-6">
                      <div className="w-24 h-24 bg-gradient-to-br from-purple-400 to-pink-400 rounded-lg flex items-center justify-center flex-shrink-0">
                        {item.product.image_url ? (
                          <img src={item.product.image_url} alt={item.product.name} className="w-full h-full object-cover rounded-lg" />
                        ) : (
                          <ShoppingBag className="text-white" size={40} />
                        )}
                      </div>

                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-white mb-2" data-testid={`item-name-${item.product.id}`}>{item.product.name}</h3>
                        <p className="text-white/70 mb-3">${item.product.price} x {item.quantity}</p>
                        
                        <div className="flex items-center gap-3">
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-white text-white hover:bg-white/10 w-8 h-8 p-0"
                            onClick={() => updateCartQuantity(item.product.id, item.quantity - 1)}
                            data-testid={`decrease-qty-${item.product.id}`}
                          >
                            -
                          </Button>
                          <span className="text-white font-bold w-8 text-center" data-testid={`qty-${item.product.id}`}>{item.quantity}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-white text-white hover:bg-white/10 w-8 h-8 p-0"
                            onClick={() => updateCartQuantity(item.product.id, item.quantity + 1)}
                            data-testid={`increase-qty-${item.product.id}`}
                          >
                            +
                          </Button>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-2xl font-bold text-white mb-3" data-testid={`item-total-${item.product.id}`}>
                          ${(item.product.price * item.quantity).toFixed(2)}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                          onClick={() => removeFromCart(item.product.id)}
                          data-testid={`remove-item-${item.product.id}`}
                        >
                          <Trash2 size={20} />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-1">
              <Card className="glass-effect border-white/20 sticky top-24" data-testid="order-summary">
                <CardContent className="p-6">
                  <h2 className="text-2xl font-bold text-white mb-6">Order Summary</h2>
                  
                  <div className="space-y-3 mb-6">
                    <div className="flex justify-between text-white">
                      <span>Subtotal ({cartItemCount} items):</span>
                      <span className="font-semibold" data-testid="subtotal">${total.toFixed(2)}</span>
                    </div>
                    <div className="border-t border-white/20 pt-3">
                      <div className="flex justify-between text-white text-xl font-bold">
                        <span>Total:</span>
                        <span data-testid="cart-total">${total.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <Link to="/checkout">
                    <Button className="w-full bg-white text-green-600 hover:bg-gray-100 py-6 text-lg" data-testid="checkout-btn">
                      Checkout
                    </Button>
                  </Link>

                  <Link to="/products" className="block mt-4">
                    <Button variant="outline" className="w-full border-white text-white hover:bg-white/10" data-testid="continue-shopping">
                      Continue Shopping
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>

      <Footer settings={settings} />
    </div>
  );
};

export default CartPage;
